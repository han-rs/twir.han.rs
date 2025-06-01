<!-- ---
author: Natalie Klestrup Röijezon, translated by Hantong Chen
title: "从头开始异步 (1): Future 到底是什么?"
pubDatetime: 2025-06-01T15:30:00.000+08:00
# modDatetime:
featured: true
draft: false
tags:
  - rust
  - translation
  - twir
description: ""
--- -->

> `This Week in Rust (TWiR)` Rust 语言周刊中文翻译计划, 第 595 期
>
> 本文翻译自 Natalie Klestrup Röijezon 的博客文章 [https://natkr.com/2025-04-10-async-from-scratch-1/](https://natkr.com/2025-04-10-async-from-scratch-1/), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](../glossary/rust-glossary.md).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 6 月 1 日下午, 于北京.
>
> 祝端午安康, 也祝孩子们六一国际儿童节快乐!

![GitHub last commit](https://img.shields.io/github/last-commit/han-rs/twir.han.rs?path=src%2F595%2Fnatkr-async-from-scratch-1.md&style=social&label=Last%20updated)

# Async from scratch 1: What's in a Future, anyway?

There are a lot of guides about how to use async Rust from a "user's perspective", but I think it's also worth understanding how it works, what those `async` blocks actually mean.

关于如何从 "用户角度" 使用异步 Rust 的指南有很多, 但我认为同样值得去了解它的工作原理, 以及那些 `async` 块究竟意味着什么.

Why you get all those weird pinning errors.

(再者, 有助于解答诸如) 为什么你会遇到那些奇怪的 "固定" (pinning) 错误 (的问题).

(译者注: `Pin` 作为异步 Rust 的一个术语, 直译为 "大头针", 引申为 "固定", 后续保留不译.)

This is the first post in a series where we're going to slowly build our way up to reinventing the modern async Rust environment, in an attempt to explain the whys and the hows. It's not going to end up being a competitor to [Tokio](https://tokio.rs/) or anything, but hopefully it should make understanding it a bit less daunting afterwards.

这是系列文章的第一篇, 我们将逐步构建现代异步 Rust 环境, 试图解释其背后的原因和实现方式. 它最终不会成为 [Tokio](https://tokio.rs/) 之类的异步运行时库, 只是希望能在之后让你更好地理解 (这些库提供的大同小异的 API).

I'm writing the series targeted at people who've written a `trait` and an `async fn` (or two), but don't worry if "polling", "pinning", or "wakers" mean nothing to you. That's what we're going to try to untangle, one step at a time!

本系列面向那些写过 `trait` 和/ 或 `async fn` 的人, 但如果你对 "轮询 (polling)" 、 "固定 (pinning)" 或 "唤醒器 (wakers)" 一无所知, 也不用担心. 我们将一步步尝试解开这些谜团!

Now... If you've written any async Rust code, it probably looked something like this:

现在... 如果你写过任何异步 Rust 代码, 它可能看起来像这样:

```rust,no_run
async fn trick_or_treat() {
    for house in &STREET {
        match demand_treat(house).await {
            Ok(candy) => eat(candy).await,
            Err(_) => play_trick(house).await,
        }
    }
}
```

But, uh, what does that do? Why do I need to `await` things, how is an `async fn` different from any other `fn`, and what does any of that actually... *do*, anyway?

但是, 呃, 这到底做了什么? 为什么我需要 `await` 它, `async fn` 和其他 `fn` 有什么不同, 这些到底... 是干什么的?

## In the `Future`... | `Future` 是什么

Well, to understand that, we're going to need to rewind the tape a bit. We're going to have to meet a trait that you probably haven't really seen before. We're going to have to deal with... `Future`. Just like `Add` defines whether a + b is valid, Future defines "something that can be `.await`-ed".[^1] It looks like this:

要理解这些, 我们需要稍微倒带一下. 我们将遇到一个你可能从未真正见过的 trait: `Future`. 就像 `Add` 定义了 a + b 是否有效一样, `Future` 定义了 "可以被 `.await` 的东西[^1]" . 它的定义如下:

[^1]: Well actually, `.await` is defined by `IntoFuture`.. but that's just a thin conversion wrapper. 实际上 `.await` 定义于 `IntoFuture`, 虽然只是个薄薄一层转换用的包装 (wrapper) 罢了.

```rust,no_run
use std::{task::{Context, Poll}, pin::Pin};

trait Future {
    type Output;
    fn poll(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
    ) -> Poll<Self::Output>;
}
```

..Y'know, for a trait with only one function, that's a pretty spicy one signature. It could even be called a bit overwhelming. Especially if you're new to Rust in general.

... 要知道, 对于一个只有一个函数的 trait 来说, 这个方法签名相当 "辣" (一眼让人迷糊). 甚至可以说有点让人不知所措, 尤其是如果你刚接触 Rust 的话.

But most of that doesn't really matter, so we can make a few simplifications for now. Don't worry, we'll get back to all of them later. But for now, we can strip most of that away, and just pretend that it looks like this instead:

但大部分内容其实并不重要, 所以我们现在可以做一些简化. 别担心, 稍后我们会回到所有这些内容. 但现在, 我们可以去掉大部分内容, 假装它看起来像这样:

```rust
use std::task::Poll;

trait SimpleFuture<Output> {
    fn poll(&mut self) -> Poll<Output>;
}
```

So what does this `(Simple)Future::poll` thing do?

那么这个 `SimpleFuture::poll` 是做什么的呢?

## Let's take a stroll down to the poll box | 让我们看看 `poll`

At its core, a `Future` is a function call that can pause itself when it needs to wait for something.[^2]

本质上, `Future` 是一种能在需要等待时自行暂停的函数调用.[^2]

[^2]: Like waiting for a timer, receiving a message over the network, that sort of thing. 像计时器, 从网络接收信息, 等等.

`poll` asks the `Future` to try to continue, returning `Poll::Ready` if it was able to finish, or `Poll::Pending` if it had to pause itself again.[^3]

`poll` 方法会要求 `Future` 尝试继续执行, 若完成则返回 `Poll::Ready`, 若未执行完毕则返回 `Poll::Pending`.[^3]

[^3]: If that sounds like an Option.. It basically is! Except the code often becomes clearer when our types embed the meaning that they represent. An Option could be None for many reasons, but a Pending is always a work in progress. 如果这听起来像是一个 `Option`... 它本质上就是! 只不过当我们的类型能嵌入其所代表的含义时, 代码通常会变得更清晰. `Option` 可能因多种原因而为 `None`, 但 `Pending` 始终代表进行中的工作.

This can start out pretty simple. We could have a Future that is always ready to produce some extremely random numbers:

初始实现可以非常简单. 比如我们可以创建一个总能生成特定随机数的 `Future`:

```rust,no_run
struct FairDice;

impl SimpleFuture<u8> for FairDice {
    fn poll(&mut self) -> Poll<u8> {
        Poll::Ready(4) // chosen by fair dice roll
    }
}
```

We could also just wait forever, grabbing some breathing room:

我们也可以选择永远等待, 给自己留些喘息空间:

```rust,no_run
struct LookBusy;

impl SimpleFuture<()> for LookBusy {
    fn poll(&mut self) -> Poll<()> {
        Poll::Pending
    }
}
```

These have all been pretty trivial problems, but to be able to pause things midway we'll need to save all the context that should be kept.

这些问题虽然都很简单, 但要想中途暂停操作, 我们需要保存所有应保留的上下文.

This is where our `Future` becomes relevant as a type, and not just a marker for which `poll` function to call. We could have a `Future` that needs to be polled 10 times before it completes:

这时我们的 `Future` 就不仅仅是标记该调用哪个 `poll` 函数的标识了, 而是作为一个类型真正发挥作用. 比如可能存在需要轮询 10 次才能完成的 `Future`:

```rust,no_run
struct Stubborn {
    counter: u8,
}

impl SimpleFuture<()> for Stubborn {
    fn poll(&mut self) -> Poll<()> {
        self.counter += 1;
        if self.counter == 10 {
            Poll::Ready(())
        } else {
            Poll::Pending
        }
    }
}
```

Or a wrapper that delegates to another `Future`:

或者一个对其他 `Future` 的包装:

```rust,no_run
struct LoadedDice {
    inner: FairDice,
}

impl SimpleFuture<u8> for LoadedDice {
    fn poll(&mut self) -> Poll<u8> {
        match self.inner.poll() {
            Poll::Ready(x) => Poll::Ready(x + 1),
            Poll::Pending => Poll::Pending,
        }
    }
}
```

Now.. writing all those "`match poll`, if pending then return, if ready then continue" blocks can also get pretty tedious. Thankfully, Rust provides the `ready!` macro that does it for us.[^4]

现在... 编写那些 "匹配 `poll` 结果, 若 pending 则返回, 若 ready 则继续" 的代码块也相当繁琐. 幸运的是, Rust 提供了 `ready!` 宏来帮我们处理这些.[^4]

[^4]: If this reminds you of the `?` operator.. Yeah, this is another parallel. 如果这让你想起了 `?` 操作符... 没错, 这是另一个相似之处.

The example above could also be written like this:

上面的例子也可以这样写:

```rust,no_run
use std::task::ready;

struct LoadedDice {
    inner: FairDice,
}

impl SimpleFuture<u8> for LoadedDice {
    fn poll(&mut self) -> Poll<u8> {
        let x = ready!(self.inner.poll());
        Poll::Ready(x + 1)
    }
}
```

But eventually we'll want to be able to await multiple times, and to save stuff between them. For example, we might want to sum up pairs of our dice:

但最终我们会需要多次 await, 并在其间保存状态. 例如, 我们可能想累加骰子的点数对:

```rust,no_run
async fn fair_dice() -> u8 {
    4 // still guaranteed to be completely fair
}

async fn fair_dice_pair() -> u8 {
    let first_dice = fair_dice().await;
    let second_dice = fair_dice().await;
    first_dice + second_dice
}
```

We can do this by saving the shared state in an `enum` instead, with a variant for each `await` point. This kind of rearrangement is called a "state machine", and this is also effectively what `async fn` does for us behind the scenes. That ends up looking like this:

可以通过将共享状态保存在枚举中实现, 每个 `await` 点对应一个枚举变体. 这种重构方式被称为"状态机", 实际上 `async fn` 在底层也是这么做的. 最终代码会变成这样:

```rust,no_run
enum FairDicePair {
    Init,
    RollingFirstDice {
        first_dice: FairDice,
    },
    RollingSecondDice {
        first_dice: u8,
        second_dice: FairDice,
    }
}

impl SimpleFuture<u8> for FairDicePair {
    fn poll(&mut self) -> Poll<u8> {
        // The loop lets us continue running the state machine
        // until one of the ready! clauses pauses us.
        loop {
            match self {
                Self::Init => {
                    *self = Self::RollingFirstDice {
                        first_dice: FairDice,
                    };
                },
                Self::RollingFirstDice { first_dice } => {
                    // Every time we're poll()ed, we'll do _everything_ up to the
                    // next ready! again (poll() is just another method, after all),
                    // so it should be the first (non-trivial) thing we do every time
                    // it's called.
                    let first_dice = ready!(first_dice.poll());
                    *self = Self::RollingSecondDice {
                        first_dice,
                        second_dice: FairDice,
                    }
                }
                Self::RollingSecondDice { first_dice, second_dice } => {
                    let second_dice = ready!(second_dice.poll());
                    return Poll::Ready(*first_dice + second_dice)
                }
            }
        }
    }
}
```

This is.. just a bit.. more verbose.

这... 只是稍微... 啰嗦了一点.

But on the flip side, a raw `poll` lets us do things that `async fn` can't really express. For example, we can build a timeout that only lets us poll some arbitrary wrapped Future so many times:[^5]

但另一方面, 原始 `poll` 操作能实现 `async fn` 难以表达的功能. 比如我们可以构建一个超时机制, 限制对任意包裹在其中的 `Future` 的轮询次数:[^5]

[^5]: In reality, you'd want to use time instead of trying to count poll calls.. but dealing with time brings in more moving parts that I don't want to deal with right now. 实际上, 你应该用时间而非试图统计轮询调用的次数... 但处理时间会引入更多我现在不想应对的复杂因素. (说白了就是用 `std::time::Instant` 记录起始时间, 调用 `.elapsed()` 获得已经过的时间.)

```rust,no_run
struct Timeout {
    inner: Stubborn,
    polls_left: u8,
}

#[derive(Debug)]
struct TimedOut;

impl SimpleFuture<Result<(), TimedOut>> for Timeout {
    fn poll(&mut self) -> Poll<Result<(), TimedOut>> {
        match self.polls_left.checked_sub(1) {
            Some(x) => self.polls_left = x,
            None => return Poll::Ready(Err(TimedOut)),
        }
        let inner = ready!(self.inner.poll());
        Poll::Ready(Ok(inner))
    }
}
```

## Let's ~~dance~~ run | 让我们开始运行

So.. we've defined our `(Simple)Future`. A few, in fact. But they're not really worth much unless we can actually run them. How do we do that?

所以...我们已经定义了我们的 `(Simple)Future`. 实际上定义了好几个. 但除非能真正运行它们, 否则这些定义意义不大. 我们该怎么做呢?

Simple. We just keep calling `poll` until it returns `Ready`[^6].

很简单. 只需不断调用 `poll` 直到返回 `Ready`[^6].

[^6]: Calling poll again after that point is undefined, but usually it'll either panic or keep returning `Pending` forever. 在此之后再次调用 `poll` 的行为是未定义的, 但通常它要么会 panic, 要么永远返回 `Pending` 状态。

```rust,no_run
fn run_future<Output, F: SimpleFuture<Output>>(mut fut: F) -> Output {
    loop {
        if let Poll::Ready(out) = fut.poll() {
            return out;
        }
    }
}
```

For example:

如:

```rust,no_run
println!("=> {}", run_future(FairDice));
```

```plaintext
=> 4
```

Now, this does have a catch. Just a tiny one. A teeny-tiny one. A teeny tiny toy catch.

不过这里有个小问题. 非常小的问题. 微小到像玩具般的问题.

While waiting for our Future to complete we're wasting a lot of CPU cycles, just calling poll over and over.[^7] That's not ideal, but for now, let's just put a pin in that. We'll come back to it soon enough.

在等待 `Future` 完成时, 我们只是不断调用 `poll`, 浪费了大量 CPU 周期.[^7] 这并不理想, 但暂时先记下这点, 稍后再来处理.

[^7]: Someone once said something about the sanity that that would imply... 曾有人说过, 那暗示着某种理智......

## Enter the combinatrix | 组合器的登场

As we can see, trying to write all of our logic as a `poll` quickly grows out of control, but sometimes we do need to express things that regular sequences of function calls.. can't.[^8]

可以看到, 将所有逻辑写成 `poll` 形式会迅速失控, 但有时确实需要表达普通函数调用序列无法实现的功能.[^8]

[^8]: And even those regular sequences need to call into primitives that actually do things eventually. `Future`s don't just come fully formed out of the ether, after all. 即便是那些常规的序列, 最终也需要调用真正执行操作的底层原语. 毕竟, `Future` 不会凭空完整地出现.

Is there a way to let us combine them, so we can use whatever fits the job best?

有没有办法让我们组合它们, 以便选择最适合任务的方案?

Well, yes. We can write combinators, generalizing our special logic into new building blocks that our `async fn` can then reuse.

当然有. 我们可以编写组合器, 将特殊逻辑泛化为新的构建块, 供 `async fn`复用.

For example, our `Timeout` example can be changed to accept any arbitrary `Future`, instead of only `Stubborn`:

例如, `Timeout` 示例可以修改为接受任意 `Future`, 而不仅是 `Stubborn`:

```rust,no_run
struct Timeout<F> {
    inner: F,
    polls_left: u8,
}

struct TimedOut;

impl<F, Output> SimpleFuture<Result<Output, TimedOut>> for Timeout<F>
where
    F: SimpleFuture<Output>,
{
    fn poll(&mut self) -> Poll<Result<Output, TimedOut>> {
        match self.polls_left.checked_sub(1) {
            Some(x) => self.polls_left = x,
            None => return Poll::Ready(Err(TimedOut)),
        }
        let inner = ready!(self.inner.poll());
        Poll::Ready(Ok(inner))
    }
}

fn with_timeout<F, Output>(
    inner: F,
    max_polls: u8,
) -> impl SimpleFuture<Result<Output, TimedOut>>
where
    F: SimpleFuture<Output>,
{
    Timeout {
        inner,
        polls_left: max_polls,
    }
}
```

Which we could then use in our `async fn`, by wrapping the sub-Future before `await`-ing it:[^9]

然后可以在 `async fn` 中使用, 通过在 `await` 前包装子 `Future`:[^9]

[^9]: In our imaginary world where Rust supports `await`-ing SimpleFuture rather than Future, anyway. 在我们假想的世界里, Rust 支持 `await` 一个 `SimpleFuture` 而非 `Future`.

```rust,no_run
async fn send_email(target: &str, msg: &str) {}

struct TimedOut;

async fn with_timeout<F: Future>(inner: F, max_polls: u8) -> Result<F::Output, TimedOut> { Ok(inner.await) }

async fn send_email_with_retry() {
    for _ in 0..5 {
        if with_timeout(send_email("nat@nullable.se", "message"), 10).await.is_ok() {
            return;
        }
    }
    panic!("repeatedly timed out trying to send email, giving up...");
}
```

## Input, output | 输入与输出

We've spent some time working out how to combine our `Future`s... but they don't really.. do anything yet. If a `Future` runs in the forest computer, but nobody was around to run it.. we haven't really done much more than burn some electricity.

我们花了些时间研究如何组合 `Future`... 但它们实际上还没做任何事. 如果 `Future` 在森林计算机中运行, 却无人执行它... 我们不过是浪费了些电力.

To be useful we'll need to be able to interact with external systems. Network calls, and so on.

要让其有用, 需要能与外部系统交互. 比如网络调用等.

Let's try reading something from a TCP socket, for example. We'll provide a server that provides our luggage code whenever we connect. For safekeeping, of course.

以读取 TCP 套接字为例. 我们将搭建一个服务器, 连接时提供行李代码 (当然是为了安全保管).

```rust,no_run
let listener = std::net::TcpListener::bind("127.0.0.1:9191").unwrap();

std::thread::spawn(move || {
    use std::{io::Write, time::Duration};
    let (mut conn, _) = listener.accept().unwrap();
    // Ensure that the client needs to wait for
    std::thread::sleep(Duration::from_millis(200));
    conn.write_all(&[1, 2, 3, 4, 5]).unwrap();
});
```

To do this, we'll need to do a few things:

为此需要:

1. Create the socket (this happens implicitly in Rust's API)

   创建套接字 (Rust API 隐式完成)

2. Connect to the remote destination

   连接远程目标

3. Configure the socket to be non-blocking (since otherwise the receive itself would just wait for the message, preventing any other Futures from running on the same thread)10

   配置非阻塞套接字 (否则接收操作会阻塞, 阻止同线程运行其他 Future)

4. Try to read the message

   尝试读取消息

5. If the read returned `WouldBlock`, return `Pending` and retry from step 4 on the next `poll`

   如果读取返回 `WouldBlock`, 返回 `Pending` 并在下次 `poll` 时重试步骤 4

Putting it together looks something like this:

组合起来如下:

```rust,no_run
use std::{io::Read, net::TcpStream};

struct TcpRead<'a> {
    socket: &'a mut TcpStream,
    buffer: &'a mut [u8],
}

impl<'a> SimpleFuture<usize> for TcpRead<'a> {
    fn poll(&mut self) -> Poll<usize> {
        match self.socket.read(self.buffer) {
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => Poll::Pending,
            size => Poll::Ready(size.unwrap()),
        }
    }
}
```

```rust,no_run
let luggage_code_server_address = "127.0.0.1:9191";

let mut socket = TcpStream::connect(luggage_code_server_address).unwrap();

socket.set_nonblocking(true).unwrap();

let mut buffer = [0; 16];
let received = run_future(TcpRead {
    socket: &mut socket,
    buffer: &mut buffer,
});

println!("=> The luggage code is {:?}", &buffer[..received]);
```

```plaintext
=> The luggage code is [1, 2, 3, 4, 5]
```

## Until next time... | 下回分解...

Hopefully, you now have a bit of a handle on the general idea of how `Future`s interact. We've seen how to define, run, combine them, and used them to communicate with a network service.

希望你现在对 `Future` 的原理有了基本认识. 我们已了解如何定义、运行和组合它们, 并用其与网络服务通信.

But as I mentioned, we've only really talked about our simplified `SimpleFuture` variant. Through the rest of the series, I'll focus on pulling back those curtains, one by one, until we arrive back at the real Future trait.

但如前所述, 我们讨论的只是简化版 `SimpleFuture`. 本系列后续将逐步揭开面纱, 直至触及真正的 `Future` 特性.

First up, our `SimpleFuture` is [pretty wasteful](#lets-dance-run--让我们开始运行) since we need to keep polling constantly, not just when there is anything useful for us to do. The solution to that is called a waker. But that's a topic for next time...

首先, `SimpleFuture` 持续轮询的方式[效率低下]((#lets-dance-run--让我们开始运行)). 解决方案称为 waker, 这将是下期主题...

UPDATE: It's [now out](../595/natkr-async-from-scratch-2.md), go take a look!

更新: 新篇[已发布](../595/natkr-async-from-scratch-2.md), 快去看看吧!
