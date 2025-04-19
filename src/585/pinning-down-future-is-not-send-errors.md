<!-- ---
author: Evan Schwartz, translated by Hantong Chen
pubDatetime: 2025-02-08T20:42:54.000+08:00
modDatetime: 2025-02-16T23:04:59.000+08:00
title: 定位 "Future Is Not Send" 错误
featured: true
draft: false
tags:
  - rust
  - translation
  - twir
description: "如果您使用异步 Rust 和 Tokio, 则可能会遇到各式各样的 \"future is not Send\" 编译器错误. 在试图将同步代码异步化以使用流(stream)时, 一个朋友建议一种小型技术来定位 non-Send 错误的来源. 它有很大帮助, 所以我认为值得在此分享, 让后来者节省一些令人讨厌的调试时间."
--- -->

> `This Week in Rust (TWiR)` Rust 语言周刊中文翻译计划, 第 585 期
>
> 本文翻译自 Evan Schwartz 的博客文章 [https://emschwartz.me/pinning-down-future-is-not-send-errors](https://emschwartz.me/pinning-down-future-is-not-send-errors), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 2 月 8 日晚, 于广州.

![GitHub last commit](https://img.shields.io/github/last-commit/han-rs/twir.han.rs?path=src%2F585%2Fpinning-down-future-is-not-send-errors.md&style=social&label=Last%20updated)

来自译者的前言:

Rust 的难度有目共睹, 异步 Rust 更是难上加难, 毕竟异步本来就不是件简单的事情, 有的语言一开始压根没有异步的概念(例如 Python 直到 3.4 才引入 asyncio), 有的语言异步从一而终(无 goroutine 无 Go), 它们大多数都将异步那些复杂的实现隐藏, 让新手也能轻松入门, 而 Rust 作为现代系统级编程语言, 选择让你去从底层控制(当然 `tokio` 一类的库帮你干了很多很多).

本文主要讲述如何理解, 以及如何定位哪导致 `Future is not Send` 的问题, 个人觉得写得非常好, 适合初学者学习.

---

# Pinning Down "Future Is Not Send" Errors

定位 "Future Is Not Send" 错误

If you use async Rust and Tokio, you are likely to run into some variant of the "future is not `Send`" compiler error. While transitioning some sequential async code to use streams, a friend suggested a small technique for pinning down the source of the non-`Send` errors. It helped a lot, so I thought it would be worth writing up in case it saves others some annoying debugging time.

如果您使用异步 Rust 和 Tokio, 则可能会遇到各式各样的 "future is not `Send`" 编译器错误. 在试图将同步代码异步化(译者注: 大部分情况下简单加上 `async` 关键字就可以啦) 以使用流(stream)时, 一个朋友建议一种小型技术来定位 non-`Send` 错误的来源. 它有很大帮助, 所以我认为值得在此分享, 让后来者节省一些令人讨厌的调试时间.

I'll give a bit of background on `Future`s and `Send` bounds first, but if you want to skip past that you can jump to `The DX Problem with Non-Send Futures` or `Pinning Down the Source of Non-Send Errors`.

我会先介绍一些有关 `Future` 或者 `Send` 的背景知识, 当然您也可以跳到后文.

## Table of contents

## Why Futures Must Be `Send` | 为什么 `Future`s 必须(实现) `Send`

(译者特注: `Send` 是 Rust 中的一个概念, 语言设计上表示为一个 marker trait, "`impl Send`" 和 "某个结构体(or else) `Send`" 的说法是一个意思, 下不再赘述.)

I wrote another blog post about the relationship between async Rust and `Send + Sync + 'static` so we won't go into detail about that here. The main thing we'll focus on here is that if you're using Tokio, you're probably going to be `spawn`ing some Futures, and if you `spawn` a Future it must be `Send + Sync + 'static`.

我写了[另一篇博客文章](https://emschwartz.me/async-rust-can-be-a-pleasure-to-work-with-without-send-sync-static/)(译者注: 后续视情况翻译), 介绍了异步 Rust 和 `Send + Sync +'static` 之间的关系, 因此我们在这里不会详细介绍. 我们将重点关注的主要内容是, 如果您使用的是Tokio, 那么您可能会 `spawn` 一些 `Future`s, 它们必须是 `Send + Sync + 'static` 的.

```rust
pub fn spawn<F>(future: F) -> JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
```

## How Futures Lose Their `Send` Markers | `Future`s 是怎么就不 `Send` 了的

Most types are automatically marked as `Send`, meaning they can be safely moved between threads.

大多数类型都自动实现了 `Send`, 这标记着它们 **可以在线程之间安全地移动**.(译者注: marker trait 确实非常贴切, marker -> 标记)

As the The Rustonomicon says:

但如 Rust 死灵书 (Rustomonicon) 所说:

> Major exceptions include 主要例外包括:
> 
> - raw pointers are neither `Send` nor `Sync`(because they have no safety guards).
>   原始指针既不 `Send` 也不 `Sync` (因为它们没有任何安全保证).
> - `UnsafeCell` isn't Sync (and therefore `Cell` and `RefCell` aren't).
>   `UnsafeCell` 不 `Sync` (因此 Cell 和 RefCell 亦然).
> - `Rc` isn't `Send` or `Sync` (because the refcount is shared and unsynchronized).
>   `Rc` 既不 `Send` 也不 `Sync` (因为引用计数是共享和不同步的).

Pointers and `Rc`s cannot be moved between threads and nor can anything that contains them.
(简而言之), 指针和 `Rc`s 不能在线程之间移动, 包含它们的任何东西自然也如此.

Futures are structs that represent the state machine for each step of the asynchronous operation. When a value is used across an await point, that value must be stored in the Future. As a result, using a non-Send value across an await point makes the whole Future non-Send.

`Future`s 是代表异步操作每个步骤的状态机的结构体. 当跨 `.await` 边界使用一个值时, 该值必须存储在 `Future` 中. 因此, 跨 `.await` 边界使用的值是非 `Send` 的, 将导致产生的或从属的 `Future` 也是非 `Send` 的.

译者补充(必读):

`async fn` 算个语法糖, 本质 (解糖, de-sugar) 是返回一个**匿名**结构体, 该结构体实现了 `Future` 这个 trait (Return Position `impl Trait`, RPIT). 在后续让 trait 里面支持写 `async fn` (`async fn` In Traits, AFIT) 本质也是如此 (Return Position `impl Trait` In `Trait`s, RPITIT).

```rust
trait TestT {
    // AFIT 写法
    async fn hello() -> Result<String, Error>;
    // RPITIT 的写法
    fn hello() -> impl Future<Output = Result<String, Error>>;
}
```

目前 AFIT 并未非常成熟, 还是推荐 RPITIT 的写法, 官方对于 pub trait 也是如此推荐的.

这篇博文更深入一点, 有兴趣可以阅读: [https://nihil.cc/posts/rust_rpitit_afit/](https://nihil.cc/posts/rust_rpitit_afit/)

## The DX Problem with Non-Send Futures | 非 `Send` `Future`s 的 DX 问题

(译者注: 原文并没有指出 DX 是什么的缩写, 不译, 不影响理解)

To illustrate the problem in the simplest way possible, let's take an extremely simplified example.

为了以最简单的方式说明问题, 让我们看一个极为简化的示例.

Below, we have an async `noop` function and an async not_send function. The not_send function holds an Rc across an await point and thus loses its Send bound -- but shhh! let's pretend we don't know that yet. We then have an `async_chain` that calls both methods and a function that spawns that Future.

下面的示例中, 我们有一个异步的 `noop` 方法和一个异步的 `not_send` 方法.  `not_send` 方法中 `Rc` 的生命周期跨越 `.await` 边界 (或者说在 `Rc` 还 "活着" 的时候 `.await` 了其他异步方法), 因此不再 `Send`. 但是! 让我们假装我们还不知道 (毕竟代码行数一多起来就很容易忽略). 然后, `async_chain` 调用了这两个方法, 还有一个 `spawn`s `Future` 的方法.

(译者特注: `Future` 语言设计上表示为一个 trait, "返回一个匿名结构体, 这个结构体 `impl Future`" 的说法和 "返回一个 `Future`" 的说法是一个意思, 下不再赘述.)

```rust
use tokio;
   
async fn noop() {}
   
async fn not_send() -> usize {
    let ret = std::rc::Rc::new(2); // <-- this value is used across the await point 这个值生命周期跨越了 await 点
    noop().await;
    *ret
}
   
async fn async_chain() -> usize {
    noop().await;
    not_send().await
}
   
fn spawn_async_chain() {
    tokio::spawn(async move {
        let result = async_chain().await;
        println!("{}", result);
    }); // <-- compiler points here 编译器(错误信息)指向这里
}
```

This code doesn't compile ([playground link](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=8a2fbb33b84cdb62d37e070223ea283c)). But where does the compiler direct our attention? If we only take a quick look at the error message, it seems like the error is coming from the `tokio::spawn` call:

此代码不能编译通过 ([来这里试一试](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=8a2fbb33b84cdb62d37e070223ea283c), 如果是 mdbook 可以直接点击运行看看). 但是编译器在哪里指出了问题? 如果我们只粗略查看错误消息, 似乎错误来自 `tokio::spawn` 调用:

```stderr
error: future cannot be sent between threads safely
   --> src/lib.rs:17:5
    |
17  | /     tokio::spawn(async move {
18  | |         let result = async_chain().await;
19  | |         println!("{}", result);
20  | |     });
    | |______^ future created by async block is not `Send`
    |
    = help: within `{async block@src/lib.rs:17:18: 17:28}`, the trait `Send` is not implemented for `Rc<usize>`
note: future is not `Send` as this value is used across an await
   --> src/lib.rs:7:12
    |
6   |     let ret = std::rc::Rc::new(2);
    |         --- has type `Rc<usize>` which is not `Send`
7   |     noop().await;
    |            ^^^^^ await occurs here, with `ret` maybe used later
note: required by a bound in `tokio::spawn`
   --> /playground/.cargo/registry/src/index.crates.io-6f17d22bba15001f/tokio-1.43.0/src/task/spawn.rs:168:21
    |
166 |     pub fn spawn<F>(future: F) -> JoinHandle<F::Output>
    |            ----- required by a bound in this function
167 |     where
168 |         F: Future + Send + 'static,
    |                     ^^^^ required by this bound in `spawn`
```

In this example, it's easy to spot the mention of the Rc<usize> not being Send -- but we know what we're looking for! Also, our async chain is pretty short so that types and error messages are still somewhat readable. The longer that chain grows, the harder it is to spot the actual source of the problem.

在此示例中, 很容易发现非 `Send` 的 `Rc<usize>` 的存在; 另外, 我们的异步调用链非常短, 因此类型和错误消息可阅性尚佳. 调用链越长, 发现问题的实际来源就越难(译者注: 确实, 写实际项目经常是好几十层, 看着就头疼).

The crux of the issue is that the compiler draws our attention first to the place where the bounds check fails. In this case, it fails when we try to `spawn` a non-Send Future -- rather than where the Future loses its Send bound.

问题的关键是: 编译器首先将我们的注意力吸引到检查到失败的边界. 在这种情况下, 当我们尝试 `spawn` 一个非 `Send` 的 `Future` 时, 它会失败, 而不是让这个 `Future` (或者说这个实现 `Future` 的匿名结构体)不再 `Send` 的地方.

## Pinning Down the Source of Not-Send Errors | 定位非 `Send` 错误的来源

There are a number of different ways we could pin down the source of these errors, but here are two:

我们可以通过多种不同的方式来定位这些错误的来源, 这里给出两个:

### Replacing `async fn` with an `impl Future` Return Type | 用 RPIT 代替 `async fn`

Instead of using an async fn, we can instead use a normal fn that returns a Future. (This is what the async keyword does under the hood, so we can just forego that bit of syntactic sugar.)

用返回一个 `impl Future` 匿名结构体的普通方法代替 `async fn` (这就是 `async` 关键字作用于 `fn` 的本质, 因此我们可以手动放弃这个语法糖).

We can transform our example above into something that looks like the code below using an async block, or alternatively using `Future` combinators.

我们可以将上面的示例转换为使用 `async` 块的看起来像代码的东西, 或使用 `Future` 组合器的代码.

Neither of these will compile ([playground link](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=40ca4d2d7cd02ec6cac4466cc6f3335b)), but this time the compiler errors will point to the Futures returned by async_chain or combinator_chain not fulfilling the Send bound that we are specifying.

[这些](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=40ca4d2d7cd02ec6cac4466cc6f3335b) 都无法编译通过, 但是这次编译器错误将明确指出 `async_chain` 或 `combinator_chain` 返回的 `Future`s 不符合我们指定的 `Send` 限定.

```rust
use tokio;
use std::future::Future;
use futures::FutureExt;

async fn noop() {}

async fn not_send() -> usize {
    let ret = std::rc::Rc::new(2);
    noop().await;
    *ret
}

fn async_chain() -> impl Future<Output = usize> + Send + 'static { // note the return type 明确写出返回类型 (虽然是 RPIT)
    async move {
        noop().await;
        not_send().await
    } // <-- now the compiler points here
}

fn spawn_async_chain() {
    tokio::spawn(async move {
        let result = async_chain().await;
        println!("{}", result);
    });
}

fn combinator_chain() -> impl Future<Output = usize> + Send + 'static { // <-- the compiler will also point here
    noop().then(|_| not_send()) // 来自三方库(?) futures 的方法
}

fn spawn_combinator_chain() {
    tokio::spawn(async move {
        let result = combinator_chain().await;
        println!("{}", result);
    });
}
```

The idea here is that we are foregoing the async fn syntax to explicitly state that the Future our functions return must be Send + 'static.

这里的精髓是, 我们正在剔除 `async fn` 语法, 明确指出我们的方法的返回的匿名结构体必须是 `impl Future<Output = ***> + Send + 'static` 的.

## Helper Function to Enforce `Send + 'static` | 辅助方法以强制保证 `Send + 'static`

In the code below ([playground link](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=be96ee358ab2064c5e9d3f1c2a9dab4c)), we'll keep our original `async fn`s but this time we'll use a helper function `send_static_future` to ensure that the value we pass to it implements Send. Here, the compiler will also point us to the right place.

在下面的代码 ([playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=be96ee358ab2064c5e9d3f1c2a9dab4c)) 中, 我们将保留我们的原始的 `async fn`s, 但是这次我们将使用一个辅助方法 `send_static_future` 来确保 `t` 是 `Send` 的. 在这里, 编译器报错还将指向正确的位置.

```rust
use tokio;
use std::future::Future;
use futures::FutureExt;

fn send_static_future<T: Future + Send + 'static>(t: T) -> T {
    t
}

async fn noop() {}

async fn not_send() -> usize {
    let ret = std::rc::Rc::new(2);
    noop().await;
    *ret
}

async fn async_chain() -> usize {
    send_static_future(async move {
        noop().await;
        not_send().await
    }).await
}

fn spawn_async_chain() {
    tokio::spawn(async move {
        let result = async_chain().await;
        println!("{}", result);
    });
}

async fn combinator_chain() -> usize {
    send_static_future(noop().then(|_| not_send())).await
}

fn spawn_combinator_chain() {
    tokio::spawn(async move {
        let result = combinator_chain().await;
        println!("{}", result);
    });
}

#[tokio::main]
async fn main() {
    spawn_combinator_chain();
}
```

While debugging, you could wrap any part of the async chain with the send_static_future function call until you've pinpointed the non-Send part.

在调试时, 您可以使用 `send_static_future` 方法将异步调用链的任何部分包裹起来, 直到您确定了非 `Send` 部分.

(This is similar what the `static_assertions::assert_impl_all` macro creates under the hood -- and using that crate is another option.)

(这与 `static_assertions::assert_impl_all` 宏进行的操作类似, 使用该 crate 是另一个选择)

## Identifying Non-Send `Stream` Combinators | 识别非 `Send` 的 `Stream` 组合器

译者注: `Future` 处理单个异步事件. 而 `Stream` 处理多个异步事件的序列, 通俗地, `Stream` 即流式处理的一大堆 `Future`s. 一个极为常见的情形是服务器流式处理客户端传过来的编码过的 HTTP Body, 接收一个数据帧处理一个数据帧.

Since the introduction of `async`/`await`, I have mostly stopped using `Future` combinators. However, combinators still seem like the way to go when working with `Stream`s.

自从引入 `async`/`await` 以来, 我基本已不再使用 `Future` 组合器. 但是, 在处理 `Stream`s 时, 组合器似乎仍然必要的.

`Stream`s present the same DX problems we've seen above when you have a combinator that produces a non-Send result.

`Stream`s 显示了前述相同的 DX 问题, 当您有一个产生非 `Send` 结果的组合器时.

Here's a simple example ([playground link](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=f24b0dce4b60c862efa22f08bbbd31f5)) that demonstrates the same issue we had with `Future`s above:

这是[一个简单的示例](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=f24b0dce4b60c862efa22f08bbbd31f5), 演示了我们上面 `Future`s 遇到的相同问题:

```rust
use futures::{pin_mut, stream, Stream, StreamExt};
use std::sync::{Arc, Mutex};

async fn noop() {}

fn stream_processing() -> impl Stream<Item = usize> {
    let state = Arc::new(Mutex::new(0));
    stream::iter(0..100).filter_map(move |i| {
        let state = state.clone();
        async move {
	          // This is contrived but we're intentionally keeping the MutexGuard across the await to make the Future non-Send
            // 这是人为的问题, 我们让 `MutexGuard` 跨越了 .await 界限, 导致这个 `Future` 不再 `Send`.
            // (译者注: `MutexGuard` 活着的时候, 就不能让别的线程上锁, 如果实现 `Send` 随意发送到别的线程就乱套了)
            // (译者注: 当然, tokio::sync::Mutex 通过额外的保证允许你那么干, 代价是性能, 可以看看我上一篇博文的译者注)
            let mut state = state.lock().unwrap();
            noop().await;
            *state += i;
            if *state % 2 == 0 {
                Some(*state)
            } else {
                None
            }
        }
    })
    // (Imagine we had a more complicated stream processing pipeline)
    // (想象我们还有一大堆复杂的流式处理管线/流程)
}

fn spawn_stream_processing() {
    tokio::spawn(async move {
        let stream = stream_processing();
        pin_mut!(stream);
        while let Some(number) = stream.next().await {
            println!("{number}");
        }
    }); // <-- the compiler error points us here
}
```

As with the Futures examples above, we can use the same type of helper function to identify which of our closures is returning a non-Send Future ([playground link](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=e6993b41356b75a7fe62920029ba47d5)):

类似地, 我们可以使用相同类型的辅助方法来识别我们的哪些闭包正在返回非 `Send` 的 `Future` ([playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=e6993b41356b75a7fe62920029ba47d5)):

```rust
use futures::{pin_mut, stream, Future, Stream, StreamExt};
use std::sync::{Arc, Mutex};

async fn noop() {}

fn send_static_future<T: Future + Send + 'static>(t: T) -> T {
    t
}

fn stream_processing() -> impl Stream<Item = usize> {
    let state = Arc::new(Mutex::new(0));
    stream::iter(0..100).filter_map(move |i| {
        send_static_future({
            let state = state.clone();
            async move {
                let mut state = state.lock().unwrap();
                noop().await;
                *state += i;
                if *state % 2 == 0 {
                    Some(*state)
                } else {
                    None
                }
            }
        }) // <-- now the compiler points us here
    })
    // (Imagine we had a more complicated stream processing pipeline)
}

fn spawn_stream_processing() {
    tokio::spawn(async move {
        let stream = stream_processing();
        pin_mut!(stream);
        while let Some(number) = stream.next().await {
            println!("{number}");
        }
    });
}
```

## Conclusion | 总结

Async Rust is powerful, but it sometimes comes with the frustrating experience of hunting down the source of trait implementation errors.

异步 Rust 是强大的, 但有时会带来令人沮丧的经历, 即寻找 trait 实现错误的来源.

I ran into this while working on [`Scour`](https://scour.ing/), a personalized content feed. The MVP used a set of sequential async steps to scrape and process feeds. However, that became too slow when the number of feeds grew to the thousands.

我在开发 [`Scour`](https://scour.ing/) 时遇到了这个问题, 这是一个个性化内容推送服务. 最初的最小可行产品（MVP）使用了一系列顺序的异步步骤来抓取和处理推送内容. 然而, 当推送内容的数量增长到数千时, 这种方法变得太慢了.

(译者注: 一大堆 `.await` 连着来和顺序执行没差别, 理论上一个 `Future` 应尽可能快地返回, 作者的应用场景显然不是, 作者的 MVP 应该是逐个 await 特定方法获取特定内容再组合起来返回, 自然效率不高, 改成 `Stream`s, 让抓取和处理过程流式化即可, 反正不在意获取到各类内容的先后.)

Transitioning to using `Stream`s allows me to take advantage of combinators like [`flat_map_unordered`](https://docs.rs/futures/latest/futures/stream/trait.StreamExt.html#method.flat_map_unordered), which polls nested streams with a configurable level of concurrency. This works well for my use case, but writing the code initially involved plenty of non-`Send`-`Future` hunting.

转向使用 `Stream`s 让我可以利用像 [`flat_map_unordered`](https://docs.rs/futures/latest/futures/stream/trait.StreamExt.html#method.flat_map_unordered) 这样的组合器. 它可以以可配置的并发级别轮询嵌套流. 这对我的使用场景很有效. 但最初编写代码时涉及大量寻找非 `Send` 的 `Future`.

(译者注: 基本符合我的猜测.)

The techniques described above helped me narrow down why my `Stream` combinator chains were becoming non-`Send`. I hope you find them useful as well!

上面描述的技术帮助我缩小了可能是是哪个闭包让我的 `Stream` 组合器变得非 `Send` 的范围. 希望您也发现它们也有用!

Thanks to [Alex Kesling](https://kesling.co/) for mentioning this technique and saving me a couple hours of fighting with `rustc`.

感谢 [Alex Kesling](https://kesling.co/) 提到了这项技术, 并为我节省了与 `rustc` 的数小时搏斗.

(译者注: 太真实了...)

## See Also | 参见

If you're working with Rust streams, you might also want to check out:

如果您正在使用 Rust streams, 您可能需要:

- [async-fn-stream](https://crates.io/crates/async-fn-stream) is a nice crate for creating streams using a simpler closure syntax.

  [async-fn-stream](https://crates.io/crates/async-fn-stream) 是允许您使用更简单的闭合语法创建流的好 crate.
- [pumps](https://crates.io/crates/pumps) is an interesting and different take on Rust streams.

- [argus](https://github.com/cognitive-engineering-lab/argus) is an experimental VS Code extension that uses Rust's New Trait Solver to help you identify why some struct, Future, or Stream does not implement the traits it should.

  [argus](https://github.com/cognitive-engineering-lab/argus) 是一个实验性的 VSCode 拓展. 它使用 Rust 的新的 trait 求解器来帮助您确定某些结构体/`Future` 或 `Stream` 没实现其应有的 traits.

---

Discuss on [r/rust](https://www.reddit.com/r/rust/comments/1igr8i2/pinning_down_future_is_not_send_errors/), [Lobsters](https://lobste.rs/s/4vgdml/pinning_down_future_is_not_send_errors/), or [Hacker News](https://news.ycombinator.com/item?id=42918892).
