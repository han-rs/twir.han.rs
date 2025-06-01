<!-- ---
author: Natalie Klestrup Röijezon, translated by Hantong Chen
title: "从头开始异步 (2): 也许需要唤醒我"
pubDatetime: 2025-06-01T16:47:00.000+08:00
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
> 本文翻译自 Natalie Klestrup Röijezon 的博客文章 [https://natkr.com/2025-04-15-async-from-scratch-2/](https://natkr.com/2025-04-15-async-from-scratch-2/), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 6 月 1 日下午, 于北京.
>
> 祝端午安康, 也祝孩子们六一国际儿童节快乐!

![GitHub last commit](https://img.shields.io/github/last-commit/han-rs/twir.han.rs?path=src%2F595%2Fnatkr-async-from-scratch-2.md&style=social&label=Last%20updated)

# Async from scratch 2: Wake me maybe

So. You've read my [last post](../595/natkr-async-from-scratch-1.md). You got inspired. Excited, even. Deployed `SimpleFuture` to production. Spun up a few worker threads to share the load. Called it a friday. This is Rust after all, what could go wrong?

那么, 你应该读过我[上一篇文章](../595/natkr-async-from-scratch-1.md)了. 你深受启发. 甚至很兴奋. 把 `SimpleFuture` 部署到了生产环境. 启动了几个工作线程分担负载. 周五就这么愉快地收工了. 毕竟这是 Rust, 能出什么问题呢?

...aaand then someone took a look at the CPU usage.
... 然后有人看了眼CPU使用率.

![A screenshot of htop showing the process "target/release/awesome-luggage-code-server" keeping 24 cores busy.](https://natkr.com/2025-04-15-async-from-scratch-2/htop-simplefuture.png)

Oops. Good thing we're not paying for those CPU hours anyway, right?

艹. 好在我们不用为这些 CPU 时间买单, 对吧?

Maybe we should look into some of those [asterisks](../595/natkr-async-from-scratch-1.md#until-next-time--下回分解) we left unresolved, after all. We won't get through all of them today[^1], but we've got to start somewhere.

也许我们该看看之前留的那些带星号[未解决的问题](../595/natkr-async-from-scratch-1.md#until-next-time--下回分解)了. 今天肯定解决不完[^1], 但总得有个开始.

[^1]: It's a series for a reason, after all. 总归是一个系列.

## When is poll o'clock, anyway? | `poll` 到底是什么时候?

So this is the part where I start to pull back the curtain, and unravel the first lie: that `poll` is only responsible for one job (attempting to make progress).

现在我要揭开帷幕, 拆穿第一个谎言: `poll` 只负责一项工作 (尝试推进 `Future` 进度).

It actually has a secret second job: to ensure that whatever is running the `Future` is notified the next time that it would make sense to poll it again. This is where wakers (and, by extension, the Context that I handwaved away before) come in.[^2] It looks, roughly[^3], like this:

它其实还有个秘密任务: 确保运行 `Future` 的调度器能在下次应该轮询时得到通知. 这就是 `waker` (以及我之前一笔带过的 `Context`) 的用武之地[^2]. 它大致长这样[^3]:

```rust
use std::sync::Arc;

trait Wake: Send + Sync {
    // If you haven't seen `self: Foo<Self>` before, it lets you define methods that apply to certain wrapper types instead.
    // If it helps, `&self` is the same as `self: &Self`.
    //
    // 如果没见过`self: Foo<Self>`这种写法, 它允许你为特定包装类型定义方法
    // 类比来说, `&self`就等同于`self: &Self`
    fn wake(self: Arc<Self>);
}
struct Context {
    waker: Arc<dyn Wake>,
    // and some other stuff we don't really care about right now
    //
    // 其他暂时不关心的字段
}
```

[^2]: Not to be confused with the [quakers](https://en.wikipedia.org/wiki/Quakers) or [shakers](https://en.wikipedia.org/wiki/Shakers).
[^3]: Actually, `Context` contains a *`Waker`* instead. It's close enough to our `Arc<dyn Wake>`, but doesn't require using `Arc` if you're okay maintaining your own vtable. If the word "vtable" tells you nothing, just implementWake and be done with it. If the word "vtable" does tell you something... you should probably still just implement `Wake` and be done with it. 实际上, `Context` 内部包含的是一个 *`Waker`*. 它与我们的 `Arc<dyn Wake>` 非常接近, 但如果你愿意维护自己的虚函数表 (vtable) , 就不需要使用 `Arc`. 如果 "vtable" 这个词对你毫无意义, 直接实现 `Wake` trait 即可. 即便 "vtable" 这个词对你有所触动... 你可能还是应该直接实现 `Wake` 完事.

The `Future` is responsible for ensuring that [`wake`](https://doc.rust-lang.org/stable/std/task/struct.Waker.html#method.wake) is called once there is something new to do, and the runtime is free to not bother polling the Future until that happens.

`Future` 需要确保在有新进展时调用 [`wake`](https://doc.rust-lang.org/stable/std/task/struct.Waker.html#method.wake), 而运行时可以放心地不轮询 `Future` 直到被唤醒.

To manage this, we'll need to change our `(Simple)Future` trait to propagate the context:

为此我们需要修改 `(Simple)Future` 以传递上下文:

```rust,no_run
use std::task::Poll;

trait SleepyFuture<Output> {
    fn poll(
        &mut self,
        // Our new and shiny
        context: &mut Context,
    ) -> Poll<Output>;
}
```

## We've got to ~~walk~~ sleep before we can run | 先学会 ~~走~~ 睡觉才能跑

Now, our old [runner](../595/natkr-async-from-scratch-1.md#lets-dance-run--让我们开始运行) is still basically legal.[^4] We could just keep polling constantly and provide a no-op `Wake` and to shut the compiler up. It's always fine to poll our `Future` without being awoken.. the `Future` just can't rely on it.

[原来的执行器](../595/natkr-async-from-scratch-1.md#lets-dance-run--让我们开始运行)基本还能用[^4]. 我们可以持续轮询并提供一个空实现的 `Wake` 来糊弄编译器. 未经唤醒就轮询 `Future` 总是安全的... 只是 `Future` 不能依赖这种行为.

[^4]: It's not self-plagiarism if we cite it! Oh, and I guess it fulfills the type contracts, too... 只要引用了就不算自我剽窃! 哦, 我想这也符合类型契约的要求吧...

```rust,no_run
struct InsomniacWaker;

impl Wake for InsomniacWaker {
    fn wake(self: Arc<Self>) {
        // Who needs to wake up if you never managed to fall asleep?
        // 从未入睡, 又何须唤醒?
    }
}

fn insomniac_runner<Output, F: SleepyFuture<Output>>(mut fut: F) -> Output {
    let mut context = Context {
        waker: Arc::new(InsomniacWaker),
    };
    loop {
        if let Poll::Ready(out) = fut.poll(&mut context) {
            return out;
        }
    }
}
```

But... that's not particularly useful. We're passing around the context now, but.. we're still burning all that CPU time.

但这没啥用. 我们虽然传入了 context... 但 CPU 仍在空转.

Instead, we should provide a `Waker` that pauses the thread when there is nothing to do:

应该实现一个能让线程休眠的 `Waker`:

```rust,no_run
use std::sync::{Condvar, Mutex};

#[derive(Default)]
struct SleepWaker {
    awoken: Mutex<bool>,
    wakeup_cond: Condvar,
}

impl SleepWaker {
    fn sleep_until_awoken(&self) {
        let mut awoken = self.wakeup_cond
            .wait_while(
                self.awoken.lock().unwrap(),
                |awoken| !*awoken,
            )
            .unwrap();
        *awoken = false;
    }
}

impl Wake for SleepWaker {
    fn wake(self: Arc<Self>) {
        *self.awoken.lock().unwrap() = true;
        self.wakeup_cond.notify_one();
    }
}
```

`Condvar`s are a whole rabbit hole of their own, but the idea here is basically that `Condvar::wait_while` runs some test on a `Mutex`-locked value every time notify_one is called (as well as on the initial wait_while call), but unlocks the `Mutex` in between[^5]. sleep_until_awoken waits for wake to be called, and then resets itself so that it's ready for the next call.[^6]

`Condvar` 本身是个深坑, 但核心思想是: `Condvar::wait_while` 会在每次 `notify_one` 调用时 (包括初始调用) 检查 `Mutex` 锁住的值, 期间会释放锁[^5]. `sleep_until_awoken` 等待唤醒后重置状态以备下次调用[^6].

[^5]: Otherwise, we'd never be able to modify the Mutex-guarded value! 否则无法修改 `Mutex` 锁定的值!
[^6]: If this looks like we're just reimplementing `Condvar`.. we are, kind of. Except Condvar::wait isn't specified to return immediately if `notify_one` was was called before `wait`. That's a problem for us; it would silently prevent the Future from waking itself during the poll. 如果这看起来像是我们在重新实现 `Condvar`... 某种程度上确实如此. 只不过 `Condvar::wait` 并未规定若在 `wait` 之前调用了 `notify_one` 就立即返回. 这对我们而言是个问题；它会悄无声息地阻止 `Future` 在 `poll` 期间自我唤醒.

Now we just need to change our runner to call `sleep_until_awoken` between each poll:

现在修改执行器在轮询间 `sleep_until_awoken`:

fn run_sleepy_future<Output, F: SleepyFuture<Output>>(mut fut: F) -> Output {
    let waker = Arc::<SleepWaker>::default();
    let mut context = Context { waker: waker.clone() };
    loop {
        match fut.poll(&mut context) {
            Poll::Ready(out) => return out,
            Poll::Pending => waker.sleep_until_awoken(),
        }
    }
}

Just to be sure.. let's try it out before continuing. To make sure that our wakeup works, and that we're actually sleeping when we can:

测试一下确保唤醒机制有效:

```rust,no_run
struct ImmediatelyAwoken(bool);
impl SleepyFuture<()> for ImmediatelyAwoken {
    fn poll(&mut self, context: &mut Context) -> Poll<()> {
        if self.0 {
            Poll::Ready(())
        } else {
            self.0 = true;
            context.waker.clone().wake();
            Poll::Pending
        }
    }
}

struct BackgroundAwoken(bool);
impl SleepyFuture<()> for BackgroundAwoken {
    fn poll(&mut self, context: &mut Context) -> Poll<()> {
        if self.0 {
            Poll::Ready(())
        } else {
            self.0 = true;
            let waker = context.waker.clone();
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(200));
                waker.wake();
            });
            Poll::Pending
        }
    }
}

let before_immediate = std::time::Instant::now();
run_sleepy_future(ImmediatelyAwoken(false));
println!("=> immediate: {:?}", before_immediate.elapsed());

let before_background = std::time::Instant::now();
run_sleepy_future(BackgroundAwoken(false));
println!("=> background: {:?}", before_background.elapsed());
```

```plaintext
=> immediate: 7µs
=> background: 200.148889ms
```

Whew! That looks reasonable to me, at least. Let's move on, before the eye of Sauron insomnia sees us...

看起来没问题. 趁失眠的索伦之眼发现前继续...

![A screenshot of a Detector Tower from the video game Helldivers 2, affectionately known as an "Eye of Sauron" for resembling a mechanical version of the Lord of the Rings "character".](https://natkr.com/2025-04-15-async-from-scratch-2/helldivers2-detector-tower.png)

## Return of the combinators | 组合起来

This also "just works" for most combinators, as long as they make sure to pass the `Context` down the tree. Here's the the `with_timeout` example from last time; all we need to change is adding the context arguments and search/replacing[^7] SimpleFuture -> SleepyFuture:

只要确保 `Context` 能向下传递, 大多数组合子都能 "直接工作". 这是上次的 `with_timeout` 改造版:

[^7]: I hear verbing is so hot this year. Can we verb a nouned verb?

```rust,no_run
use std::task::ready;

struct Timeout<F> {
    inner: F,
    polls_left: u8,
}

#[derive(Debug)]
struct TimedOut;

impl<F, Output> SleepyFuture<Result<Output, TimedOut>> for Timeout<F>
where
    F: SleepyFuture<Output>,
{
    fn poll(
        &mut self,
        context: &mut Context,
    ) -> Poll<Result<Output, TimedOut>> {
        match self.polls_left.checked_sub(1) {
            Some(x) => self.polls_left = x,
            None => return Poll::Ready(Err(TimedOut)),
        }
        let inner = ready!(self.inner.poll(context));
        Poll::Ready(Ok(inner))
    }
}

fn with_timeout<F, Output>(
    inner: F,
    max_polls: u8,
) -> impl SleepyFuture<Result<Output, TimedOut>>
where
    F: SleepyFuture<Output>,
{
    Timeout {
        inner,
        polls_left: max_polls,
    }
}
```

## Sleepy I/O (or: Showing our `Interest`) | 休眠式 I/O (或: 展示 `Interest`) 

But this has all been (relatively) easy mode. It's all useless, if we aren't actually woken up for our I/O routines. Sadly... operating systems don't officially support our (or Rust's) `Wake` trait out of the box.

但这些都是简单模式. 如果不能为 I/O 操作唤醒, 一切都白搭. 可惜... 操作系统 (Rust 也是) 并不原生支持我们的 `Wake` trait.

Building on our [old](../595/natkr-async-from-scratch-1.md#input-output--输入与输出) `TcpRead` example from last time, the Future itself is still pretty simple:

基于[之前](../595/natkr-async-from-scratch-1.md#input-output--输入与输出)的 `TcpRead` 例子:

```rust,no_run
use std::{io::Read, net::TcpStream};

fn wake_when_readable(
    socket: &mut std::net::TcpStream,
    context: &mut Context,
) { todo!() }

struct TcpRead<'a> {
    socket: &'a mut TcpStream,
    buffer: &'a mut [u8],
}
impl SleepyFuture<usize> for TcpRead<'_> {
    fn poll(&mut self, context: &mut Context) -> Poll<usize> {
        match self.socket.read(self.buffer) {
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                wake_when_readable(self.socket, context);
                Poll::Pending
            }
            size => Poll::Ready(size.unwrap()),
        }
    }
}
```

But.. uh.. how on earth do we define `wake_when_readable`? That.. is going to have to depend on your operating system, and is going outside of what the Rust standard library really provides for us.

但如何实现 `wake_when_readable`？这取决于操作系统, 超出了 Rust 标准库范畴.

Here in Linux-land[^8], the[^9] API for this is `epoll`. It still blocks, but it lets us ask the operating system to unpark us when any of a set of "files"[^10] are ready. In the Rust world, we can access this using the nix crate, which provides a safe but otherwise 1:1 mapping to the system API.[^11]

在 Linux 世界[^8], `epoll`[^9] API 可以做到这点. 虽然仍会阻塞, 但能让我们在 "文件"[^10] 就绪时被唤醒. Rust中可以通过 [nix](https://docs.rs/nix/0.29.0/nix/sys/epoll/index.html)[^11] crate 使用这个 API.

[^8]: Cross-platform support is left as an exercise for the reader. ~~Enjoy~~! 跨平台支持作为练习留给读者完成. ~~享受吧~~!
[^9]: Not the only API, there are others. But it's the one that hits the "standard" tradeoff between not being [too](https://man7.org/linux/man-pages/man2/select.2.html) [slow](https://man7.org/linux/man-pages/man2/poll.2.html) or [too experimental](https://man7.org/linux/man-pages/man7/io_uring.7.html). Maybe `io_uring` will be everywhere in a few years, when you're the one writing the "Everything natkr got wrong" article. When you do, please [send it to me](nat@nullable.se), I look forward to reading it! 并非唯一的 API, 还有其他选择. 但它是那个在 "不[过于](https://man7.org/linux/man-pages/man2/select.2.html)[缓慢](https://man7.org/linux/man-pages/man2/poll.2.html)" 与 "[不过于实验性](https://man7.org/linux/man-pages/man7/io_uring.7.html)" 之间找到了 "标准" 平衡点的方案. 或许几年后 io_uring 会无处不在, 届时就该由你来写那篇《natkr犯下的所有错误》了. 写完后请[务必发给我](nat@nullable.se), 我期待着拜读!
[^10]: In the Unixy sense where "everything" is a "file", including network sockets. Unix 万物皆文件, 包括网络套接字.
[^11]: For anyone following along at home, I'm going to be using `nix` v0.29.0, since that's the latest version when I'm writing this. 我将应用 `nix` v0.29.0 作示范, 这是我写作此文时的最新版本.

The `epoll` API is fairly simple to use: we need to create an `Epoll`, register the events[^12] that we care about, and then wait for some events to occur. wait returns when any of the registered event(s) have occurred. When we're done, we unregister the event.

`epoll` 用法简单: 创建 `Epoll` 实例, 注册关注的事件[^12], 然后等待所关注的事件发生. 完成后, 取消注册即可.

[^12]: It would've been nice if we could link to specifically the list of event flags, but alas... 要是能直接链接到具体的事件标志列表就好了, 可惜...

Now, in theory, we could wait from our main loop. It's not like it has anything better to do while it's waiting anyway. But wakes could come from anywhere, not just direct I/O events.[^13] And we need to handle all of them. So that's out.

理论上, 我们可以让主循环原地等待. 反正它在等待期间也没有更重要的事情可做. 但唤醒信号可能来自任何地方, 而不仅仅是 I/O 事件[^13]. 我们需要处理所有情况. 所以这个方案行不通.

[^13]: Timers, background threads, and so on... 计算器, 后台线程, 等等.

So, instead, we'll shove this off to a secondary I/O driver thread, which translates our epoll events into wakes. Which we already know how to handle![^14]

我们可以分出单独的 I/O 线程处理 epoll 事件并转换为 wake 调用, 那是我们已经知道怎么处理的[^14].

[^14]: Sometimes this is called a reactor. 有时也称 reactor.

```rust,no_run
use nix::sys::epoll::{Epoll, EpollCreateFlags, EpollEvent};
use std::{collections::BTreeMap, sync::LazyLock};

static EPOLL: LazyLock<Epoll> =
    LazyLock::new(|| Epoll::new(EpollCreateFlags::EPOLL_CLOEXEC).unwrap());
static REGISTERED_WAKERS: Mutex<BTreeMap<u64, Arc<dyn Wake>>> = Mutex::new(BTreeMap::new());

fn io_driver() {
    let mut events = [EpollEvent::empty(); 16];
    loop {
        let event_count = EPOLL.wait(&mut events, 1000u16).unwrap();
        let wakers = REGISTERED_WAKERS.lock().unwrap();
        for event in &events[..event_count] {
            let waker_id = event.data();
            if let Some(waker) = wakers.get(&waker_id) {
                waker.clone().wake();
            } else {
                // This could also be an "innocent" race condition,
                // if the event is delivered just as we're deregistering a waker.
                println!("=> (Waker {waker_id} not found, bug?)")
            }
        }
    }
}
```

Then, we need some way to register an interest in a "file" (and unregister it when it isn't needed anymore). This just ensures that it'll be seen by our `io_driver`:

接着, 我们需要某种方式来注册对 "文件" 的关注 (并在不再需要时取消注册) . 这确保了它会被我们的 `io_driver` 感知到:

```rust,no_run
use nix::sys::epoll::EpollFlags;
use std::{ops::RangeFrom, os::fd::AsFd};

// We need some unique ID for each reason to be awoken..
// In reality you'd probably want some way to reuse these.
// 我们需要为每个唤醒原因分配一个唯一标识符..
// 实际上，你可能希望有某种方式来复用这些标识符。
static NEXT_WAKER_ID: Mutex<RangeFrom<u64>> = Mutex::new(0..);

struct Interest<T: AsFd> {
    // Interest needs to own the file (or borrow it),
    // to make sure that the file stays alive for as long as our interest does.
    // Interest 需要拥有文件 (或借用它),
    // 以确保文件的生命周期与我们的 interest 一样长。
    fd: T,
    registered_waker_id: Option<u64>,
}
impl<T: AsFd> Interest<T> {
    fn new(fd: T) -> Self {
        Interest {
            fd,
            registered_waker_id: None,
        }
    }

    fn register(&mut self, mut flags: EpollFlags, context: &mut Context) {
        let is_new = self.registered_waker_id.is_none();
        let id = *self
            .registered_waker_id
            .get_or_insert_with(|| NEXT_WAKER_ID.lock().unwrap().next().unwrap());
        REGISTERED_WAKERS
            .lock()
            .unwrap()
            .insert(id, context.waker.clone());
        // It's enough to get awoken once - if the Future is still interested then it should call `register`
        // to renew its interest.
        // 被唤醒一次就足够了. 如果 Future 仍有兴趣，则应调用 `register` 来续期其关注.
        flags |= EpollFlags::EPOLLONESHOT;
        let mut event = EpollEvent::new(flags, id);
        if is_new {
            EPOLL.add(&self.fd, event).unwrap()
        } else {
            EPOLL.modify(&self.fd, &mut event).unwrap()
        }
    }
}
impl<T: AsFd> Drop for Interest<T> {
    fn drop(&mut self) {
        if let Some(id) = self.registered_waker_id {
            // what if we have multiple interests open on the same fd? (read+write? multiple reads?)
            EPOLL.delete(&self.fd).unwrap();
            REGISTERED_WAKERS.lock().unwrap().remove(&id).unwrap();
        }
    }
}
```

Finally, we can slot this all into our `TcpRead`. we'll need to change it slightly to keep the `Interest`'s state, but.. it should still be recognizable enough:

把这些融合进 `TcpRead` 里面:

```rust,no_run
use std::{io::Read, net::TcpStream};

struct TcpRead<'a> {
    socket: Interest<&'a mut TcpStream>,
    buffer: &'a mut [u8],
}
impl SleepyFuture<usize> for TcpRead<'_> {
    fn poll(&mut self, context: &mut Context) -> Poll<usize> {
        match self.socket.fd.read(self.buffer) {
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                // EPOLLIN is the event for when we're allowed to read
                // from the "file".
                self.socket.register(EpollFlags::EPOLLIN, context);
                Poll::Pending
            }
            size => Poll::Ready(size.unwrap()),
        }
    }
}
```

Finally, we can put all the parts back together, and test it all against our old friend, the luggage code server:

最后让我们组合起来:

```rust,no_run
std::thread::spawn(io_driver);

let luggage_code_server_address = "127.0.0.1:9191";
let mut socket = TcpStream::connect(luggage_code_server_address).unwrap();
socket.set_nonblocking(true).unwrap();
let mut buffer = [0; 16];
let received = run_sleepy_future(
    // Let's limit the number of poll()s to make sure we're not cheating!
    // This is just for demonstration; remember that the runtime is /allowed/
    // to poll as often as it wants to.
    with_timeout(
        TcpRead {
            socket: Interest::new(&mut socket),
            buffer: &mut buffer,
        },
        // One initial poll to establish interest, then one poll once the data is ready for us.
        2,
    ),
).unwrap();
println!("=> The luggage code is {:?}", &buffer[..received]);
```

```plaintext
=> The luggage code is [1, 2, 3, 4, 5]
```

Success! We're back to where we started.. but at least our computer[^15] can rest a bit easier.

成功! 虽然回到了原点... 但至少电脑[^15]能轻松点了.

[^15]: And power bill. 以及电费账单.

## Another wrap... for now | 阶段性总结...

Hopefully, you have a bit more of an idea about what that weird `Context` thing is now.

现在你应该更理解那个奇怪的 `Context` 了.

But we're still not quite back at the real Future trait[^16]. So.. the next entry will be about just that: clearing up the remaining concepts we need to understand to be able to read the Future.[^17]

但我们还没完全还原真正的 `Future` trait[^16]. 下篇文章将补齐剩余概念, 让我们能完全理解 `Future`[^17].

[^16]: It'd sure be helpful if it ever felt like standing up. 能站起来就好.
[^17]: Spoiler: This means Pin and associated types. 剧透: 包括 `Pin` 及其关联类型.
