<!-- ---
author: Natalie Klestrup Röijezon, translated by Hantong Chen
title: "从头开始异步 (3): Pinned 在墙上"
pubDatetime: 2025-06-01T20:30:00.000+08:00
# modDatetime:
featured: true
draft: false
tags:
  - rust
  - translation
  - twir
description: ""
--- -->

> `This Week in Rust (TWiR)` Rust 语言周刊中文翻译计划, 第 601 期
>
> 本文翻译自 Natalie Klestrup Röijezon 的博客文章 [https://natkr.com/2025-05-22-async-from-scratch-3/](https://natkr.com/2025-05-22-async-from-scratch-3/), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](../glossary/rust-glossary.md).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 6 月 1 日晚, 于北京.
>
> 祝端午安康, 也祝孩子们六一国际儿童节快乐!

![GitHub last commit](https://img.shields.io/github/last-commit/han-rs/twir.han.rs?path=src%2F601%2Fnatkr-async-from-scratch-3.md&style=social&label=Last%20updated)

# Async from scratch 3: Pinned against the wall

So, we've covered polling. We've tackled sleeping (and waking). Going back to the definition, that leaves us with one core concept left to conquer: pinning!

我们已探讨了轮询 (polling). 解决了休眠与唤醒 (sleeping and waking). 回到定义, 现在只剩下一个核心概念需要攻克: 固定 (pinning).

But before we get there, there was that one tiny other aside I'd like to go over, just so we can actually use the real trait this time. It'll be quick, I promise.[^1] And then we'll be back to what you came here for.

但在深入之前, 我想先解决一个小插曲, 以便这次能真正使用标准库的 `Future` 特性. 很快就好, 我保证. [^1]然后我们就会回到正题.

## Intermission: Letting our types associate | 插曲: 关联类型

Let's ignore `poll()` completely for a second, and focus on another sneaky[^2] change I pulled between `Future` and `SimpleFuture`:

暂时忽略 `poll()`, 聚焦 `Future` 和 `SimpleFuture` 之间的微妙差异[^2]:

```rust,no_run
trait Future {
    type Output;
}

trait SimpleFuture<Output> {}
```

What's the difference between these? `Future::Output` is an "associated type". Associated types are very similar to trait generics, but they aren't used to pick the right trait implementation.

区别在于 `Future::Output` 是一个**关联类型**. 关联类型与泛型类似, 但不用于选择具体的 trait 实现.

The way I tend to think of this is that if we think of our type as a kind-of-a-function, then generics would be the arguments, while its associated types would be the return value(s).

我的理解方式是: 如果将类型视为一种函数, 泛型相当于参数, 而关联类型则是返回值.

We can define our trait implementations for any combination of generics, but for a given set of base type[^3], each associated type must resolve to exactly one real type.

我们可以为任意泛型组合实现特性, 但对于给定的基础类型[^3], 每个关联类型必须唯一确定一个具体类型.

For example, this is perfectly fine:

例如:

```rust,no_run
struct MyFuture;

impl SimpleFuture<u64> for MyFuture {}
impl SimpleFuture<u32> for MyFuture {}
```

Or this blanket implementation:

或泛型实现:

```rust,no_run
struct MyFuture;

impl<T> SimpleFuture<T> for MyFuture {}
```

But this isn't, because the implementations conflict with each other:[^4]

但以下实现会冲突[^4]:

```rust,no_run
struct MyFuture;

impl Future for MyFuture {
    type Output = u64;
}
impl Future for MyFuture {
    type Output = u32;
}
```

```plaintext
error[E0119]: conflicting implementations of trait `Future` for type `MyFuture`
  --> src/main.rs:13:1
   |
10 | impl Future for MyFuture {
   | ------------------------ first implementation here
...
13 | impl Future for MyFuture {
   | ^^^^^^^^^^^^^^^^^^^^^^^^ conflicting implementation for `MyFuture`

For more information about this error, try `rustc --explain E0119`.
error: could not compile `cargo0OpMSm` (bin "cargo0OpMSm") due to 1 previous error
```

We're also not allowed to do a blanket implementation that covers multiple types:

同样, 不允许覆盖所有类型的泛型实现:

```rust,no_run
struct MyFuture;

impl<T> Future for MyFuture {
    type Output = T;
}
```

```plaintext
error[E0207]: the type parameter `T` is not constrained by the impl trait, self type, or predicates
  --> src/main.rs:10:6
   |
10 | impl<T> Future for MyFuture {
   |      ^ unconstrained type parameter

For more information about this error, try `rustc --explain E0207`.
error: could not compile `cargojraklM` (bin "cargojraklM") due to 1 previous error
```

So... why is this useful? Well, primarily it helps type inference do a better job: if we know the type of `x`, then we also know the type of `f.await`, since it can only have one `(Into)Future` implementation[^5], which can only have one `Output` type.[^6]

那么...这有什么用呢? 首先, 它能让类型推断做得更好: 如果我们知道 `x` 的类型, 也就知道 `f.await` 的类型, 因为它只能有一个 `(Into)Future` 实现[^5], 进而只能有一个 `Output` 类型. [^6]

There's also a bit of a convenience benefit: our generic code we can refer to the associated type as `T::Output`, rather than having to bind a new type parameter. These mean roughly the same thing:

还有个便利之处: 在泛型代码中可以直接用 `T::Output` 指代关联类型, 而不用绑定新类型参数. 以下两种写法本质是等价的:

```rust,no_run
fn run_simple_future<Output, F: SimpleFuture<Output>>() -> Output {
    todo!()
}

fn run_future<F: Future>() -> F::Output {
    todo!()
}

// Though this also works
fn run_future_2<Output, F: Future<Output = Output>>() -> Output {
    todo!()
}
```

Well, now that that's out of the way.. let's get back on track. You came here to get pinned, and I wouldn't want to disappoint...

好了, 言归正传. 你来看这篇文章是为了学 `Pin` 的, 我可不想让你失望...

## But why, though? | 但为什么要用 `Pin` 呢?

Back in the ancient days of a-few-weeks-ago, I [showed](../595/natkr-async-from-scratch-1.md#lets-take-a-stroll-down-to-the-poll-box--让我们看看-poll) how we can translate any `async fn` into a state machine `enum` and a custom `Future` implementation.

几周前我曾[演示](../595/natkr-async-from-scratch-1.md#lets-take-a-stroll-down-to-the-poll-box--让我们看看-poll)过如何将任意 `async fn` 转换为状态机枚举和自定义 `Future` 实现.

Let's try doing that for (a slightly simplified version of) the [trick-or-treat example](../595/natkr-async-from-scratch-1.md) that the whole series started with:

现在让我们用贯穿本系列的 ["不给糖就捣蛋"](../595/natkr-async-from-scratch-1.md) 示例 (简化版). 试试:

```rust,no_run
// No, I haven't read "Falsehoods programmers believe about addresses",
// why would you ask that?
// 不, 我没读过《程序员对地址的常见误解》, 
// 你为什么要问这个?
struct House {
    street: String,
    house_number: u16,
}
struct Candy;

// Does nothing except wait
// (This one actually doesn't even do that.. we'll get there. Use `tokio::task::yield_now`.)
// 除了等待什么都不做
// (这个甚至实际上连等待都不做... 我们会讲到. 使用 `tokio::task::yield_now`.)
async fn yield_now() {}

async fn demand_treat(house: &House) -> Result<Candy, ()> {
    for _ in 0..house.house_number {
        // Walking to the house takes time
        yield_now().await;
    }
    Ok(Candy)
}
async fn play_trick(house: &House) {
    todo!();
}

async fn trick_or_treat() {
    // Address chosen by fair dice roll. Obviously. Don't worry about it.
    let house = House {
        street: "Riksgatan".to_string(),
        house_number: 3,
    };
    if demand_treat(&house).await.is_err() {
        play_trick(&house).await;
    }
}
```

Well that's simple enough, let's give it a go..

看起来很简单, 让我们开始改写...

```rust,no_run
struct DemandTreat<'a> {
    house: &'a House,
}
impl SimpleFuture<Result<Candy, ()>> for DemandTreat<'_> {
    fn poll(&mut self) -> Poll<Result<Candy, ()>> { todo!() }
}
struct PlayTrick<'a> {
    house: &'a House,
}
impl SimpleFuture<()> for PlayTrick<'_> {
    fn poll(&mut self) -> Poll<()> { todo!() }
}

enum TrickOrTreat<'a> {
    Init,
    DemandTreat {
        house: House,
        demand_treat: DemandTreat<'a>,
    },
    PlayTrick {
        house: House,
        play_trick: PlayTrick<'a>,
    },
}
impl<'a> SimpleFuture<()> for TrickOrTreat<'a> {
    fn poll(&mut self) -> Poll<()> {
        loop {
            match self {
                TrickOrTreat::Init => {
                    let house = House {
                        street: "Riksgatan".to_string(),
                        house_number: 3,
                    };
                    *self = TrickOrTreat::DemandTreat {
                        house,
                        demand_treat: DemandTreat {
                            house: &house,
                        }
                    };
                }
                _ => todo!(),
            }
        }
    }
}
```rust,no_run

```plaintext
error[E0597]: `house` does not live long enough
  --> src/main.rs:76:36
   |
64 | impl<'a> SimpleFuture<()> for TrickOrTreat<'a> {
   |      -- lifetime `'a` defined here
...
69 |                     let house = House {
   |                         ----- binding `house` declared here
...
73 |                     *self = TrickOrTreat::DemandTreat {
   |                     ----- assignment requires that `house` is borrowed for `'a`
...
76 |                             house: &house,
   |                                    ^^^^^^ borrowed value does not live long enough
...
79 |                 }
   |                 - `house` dropped here while still borrowed

error[E0382]: borrow of moved value: `house`
  --> src/main.rs:76:36
   |
69 |                     let house = House {
   |                         ----- move occurs because `house` has type `House`, which does not implement the `Copy` trait
...
74 |                         house,
   |                         ----- value moved here
75 |                         demand_treat: DemandTreat {
76 |                             house: &house,
   |                                    ^^^^^^ value borrowed here after move
   |
note: if `House` implemented `Clone`, you could clone the value
  --> src/main.rs:4:1
   |
4  | struct House {
   | ^^^^^^^^^^^^ consider implementing `Clone` for this type
...
74 |                         house,
   |                         ----- you could clone this value

Some errors have detailed explanations: E0382, E0597.
For more information about an error, try `rustc --explain E0382`.
error: could not compile `cargorz58SU` (bin "cargorz58SU") due to 2 previous errors
```

..oh, right. Rust really doesn't like structs that borrow themselves. We can't even express this well in its type system: we can't bind the lifetime of the `DemandTreat` to the lifetime of the `TrickOrTreat`, it has to come from an external type parameter.[^7]. We can't even construct `TrickOrTreat::DemandTreat` without the `DemandTreat`! What could we possibly do about this predicament?

...哦对了. Rust 确实不喜欢自引用的结构体. 我们甚至无法在类型系统中很好地表达这一点: 无法将 `DemandTreat` 的生命周期绑定到 `TrickOrTreat` 的生命周期, 必须依赖外部类型参数. 我们甚至无法在缺少 `DemandTreat` 的情况下构造 `TrickOrTreat::DemandTreat`! 这困境怎么破?

Well. We could just pass the ownership of the `House` into `DemandTreat`, and then have it return it once finished. (That is, change the signature from `async fn demand_treat(house: &House) -> Result<Candy, ()>` to `async fn demand_treat(house: House) -> (House, Result<Candy, ()>)`.) That works for our simple example[^8], but it breaks if we're borrowing the data ourselves, or if something else is also borrowing it at the same time as `DemandTreat`. Probably workable with enough elbow grease, but not great.

好吧. 我们可以直接把 `House` 的所有权传给 `DemandTreat`, 等它处理完后再返回.  (也就是说, 将函数签名从 `async fn demand_treat(house: &House) -> Result<Candy, ()>` 改为 `async fn demand_treat(house: House) -> (House, Result<Candy, ()>)`. ).在我们的简单示例[^8]中可行, 但如果我们自己也在借用这些数据, 或者有其他东西和 `DemandTreat` 同时借用它时, 就会出问题. 虽然花点功夫或许能解决, 但终究不是个好办法.

We could try wrapping the `DemandTreat` in an `Option`.. that'd solve the construction paradox at least. But it wouldn't do diddly to solve our lifetime problem.

我们可以尝试将 `DemandTreat` 包装在 `Option` 里... 至少能解决构造悖论. 但这对于解决生命周期问题毫无帮助.

We could try `clone`-ing the `House`.. but that assumes that it is cloneable9. We could get around that by wrapping the house in `Arc`-flavoured bubblewrap, but that assumes that we own it directly.[^10] Blech.

我们可以尝试克隆 `House`... 但这假设它是可克隆的[^9]. 我们可以通过用` Arc` 来绕过这个问题, 但这又假设我们直接拥有它[^10]. 呃.

Well, that all sucks. Maybe there is something to that old "C" thing, after all. Y'know what. Clearly [it's the compiler that is wrong](https://www.youtube.com/watch?v=eVddGSTjEd0&t=49s). How about we just use some raw pointers instead. Clearly, I can be trusted with raw pointers. Right?

唉, 这一切都糟透了. 或许那个古老的 "C" 语言确实有点道理. 你知道吗? 显然[是编译器出了问题](https://www.youtube.com/watch?v=eVddGSTjEd0&t=49s). 要不咱们干脆用裸指针算了. 显然, 我是可以信任裸指针的. 对吧?

```rust,no_run
use std::task::ready;

struct DemandTreat {
    house: *const House,
    current_house: u16,
}
impl SimpleFuture<Result<Candy, ()>> for DemandTreat {
    fn poll(&mut self) -> Poll<Result<Candy, ()>> {
        if self.current_house == unsafe { (*self.house).house_number } {
            Poll::Ready(Ok(Candy))
        } else {
            self.current_house += 1;
            Poll::Pending
        }
    }
}
struct PlayTrick {
    house: *const House,
}
impl SimpleFuture<()> for PlayTrick {
    fn poll(&mut self) -> Poll<()> { todo!() }
}

enum TrickOrTreat {
    Init,
    DemandTreat {
        house: House,
        demand_treat: DemandTreat,
    },
    PlayTrick {
        house: House,
        play_trick: PlayTrick,
    },
}
impl SimpleFuture<()> for TrickOrTreat {
    fn poll(&mut self) -> Poll<()> {
        loop {
            match self {
                TrickOrTreat::Init => {
                    *self = TrickOrTreat::DemandTreat {
                        house: House {
                            street: "Riksgatan".to_string(),
                            house_number: 3,
                        },
                        demand_treat: DemandTreat {
                            house: std::ptr::null(),
                            current_house: 0,
                        },
                    };
                    let TrickOrTreat::DemandTreat { house, demand_treat } = self else { unreachable!() };
                    demand_treat.house = house;
                }
                TrickOrTreat::DemandTreat { house, demand_treat } => {
                    match ready!(demand_treat.poll()) {
                        Ok(_) => return Poll::Ready(()),
                        Err(_) => todo!(),
                    }
                }
                _ => todo!(),
            }
        }
    }
}
```

And it works compiles! I hear that's basically the same thing. Time to celebrate. Right?

而且它能编译通过! 我听说这基本上就是成功的意思. 是时候庆祝了, 对吧?

...right?

... 吧?

...perhaps not yet.[^11] As always, raw pointers come with a cost. First, we obviously lose the niceties of borrow checking. In fact, we arguably have a lifetime bug already![^12] But there's also a deeper problem in here. Pointers (and references) point at the absolute memory location. But once `poll()` has returned, whoever is running the future has full ownership. They're free to move it around as they please.

……或许还不行. [^11] 一如既往, 裸指针是有代价的. 首先, 我们显然失去了借用检查的便利性. 事实上, 可以说我们已经存在一个生命周期错误了! [^12] 但这里还有一个更深层次的问题. 指针 (和引用).向的是绝对内存地址. 然而一旦 `poll()` 返回, 运行 future 的人就拥有了完全的所有权. 他们可以随意移动它.

```rust,no_run
let mut future = TrickOrTreat::Init;
future.poll();
// future.demand_treat.house points at future.house
// move future somewhere else
let mut future2 = future;
// future2.demand_treat.house *still* points at future.house, not future2.house!
future2.poll();
```

...oh dear.[^13] And you don't even need to own it either, [`std::mem::swap`](https://doc.rust-lang.org/stable/std/mem/fn.swap.html) and [`std::mem::replace`](https://doc.rust-lang.org/stable/std/mem/fn.replace.html) are happy to move objects that are behind (mutable) references, as long as you have a valid object to replace them with:

...哦天哪. [^13] 而且你甚至不需要拥有它, [`std::mem::swap`](https://doc.rust-lang.org/stable/std/mem/fn.swap.html) 和 [`std::mem::replace`](https://doc.rust-lang.org/stable/std/mem/fn.replace.html) 很乐意为你移动位于(可变)引用后的对象, 只要你有一个有效的对象来替换它们:

```rust,no_run
let mut future = TrickOrTreat::Init;
future.poll();
let mut future2 = std::mem::replace(&mut future, TrickOrTreat::Init);
// future *is* now still a valid object, but not the one we meant to reference.
// And future.house definitely isn't valid, since we aren't on that branch of the enum.
// future *现在* 仍然是一个有效对象, 但不是我们想要引用的那个.
// 而且 future.house 绝对无效, 因为我们不在枚举的那个分支上.
future2.poll();
```

Welp. So how can we prevent ourselves from being moved, while still allowing other writes? We stick a `Pin` on that shit!

好吧. 那么如何在允许写入的同时防止自身被移动? 我们直接给它钉个 `Pin`!

## Pinning, actually | 钉住!

A [`Pin`](https://doc.rust-lang.org/stable/std/pin/struct.Pin.html) wraps a mutable reference of some kind (`&mut T`, `Box<T>`, and so on), but restricts us (in the safe API) to reading and replacing the value entirely, without the ability to move things out of it (or to mutate only parts of them[^14]).

[`Pin`](https://doc.rust-lang.org/stable/std/pin/struct.Pin.html) 包装了某种可变引用 (如 `&mut T`、`Box<T>` 等). 但在安全 API 中限制我们只能整体读取或替换值, 而无法从中移出内容 (或仅修改其部分内容[^14]).

(译者注: 显然, `Pin` 的对象应当是指针, `Pin` 一个值是没有意义的.)

It looks like this:

像这样:

```rust,no_run
use std::ops::{Deref, DerefMut};

// SAFETY: Don't access .0 directly
struct Pin<T>(T);

impl<T: Deref> Pin<T> {
    // SAFETY: `ptr` must never be moved after this function has been called
    unsafe fn new_unchecked(ptr: T) -> Self {
        Self(ptr)
    }

    fn get_ref(&self) -> &T::Target {
        &self.0
    }
}

impl<T: DerefMut> Pin<T> {
    // SAFETY: The returned reference must not be moved
    unsafe fn get_unchecked_mut(&mut self) -> &mut T::Target {
        &mut self.0
    }

    // Allow reborrowing Pin<OwnedPtr> as Pin<&mut T>
    fn as_mut(&mut self) -> Pin<&mut T::Target> {
        Pin(&mut self.0)
    }

    fn set(&mut self, value: T::Target) where T: DerefMut, T::Target: Sized {
        *self.0 = value;
    }
}

// As a convenience, `Deref` lets us call x.get_ref().y as x.y
impl<T: Deref> Deref for Pin<T> {
    type Target = T::Target;
    fn deref(&self) -> &Self::Target {
        self.get_ref()
    }
}
```

We can then create our object "normally" and then pin it (promising to uphold its requirements from that point onwards, but also gaining its self-referential powers):

我们可以先 "一如既往" 地创建对象, 然后将其固定 (承诺从此刻起遵守其要求, 同时也获得其自引用能力).

(译者注: 应当明确, `Pin` 是个约定, 约定遵循其要求, 而不是 `Pin` 本身去保证. Rust 的一个精妙之处在于此.)

```rust,no_run
struct Foo {
    bar: u64,
}
let mut foo = Foo { bar: 0 };
// Creating a pin is unsafe, because we need to promise that we won't use the original value directly anymore, even after the pin is dropped 创建 Pin 是不安全的, 需要使用者保证.
let mut foo = unsafe { Pin::new_unchecked(&mut foo) };
// Reading is safe
println!("=> {} (initial)", foo.bar);
// Replacing is safe 替换是安全的, 因为我们完整移动了值, 移动出来的值将会在离开作用域后被安全地销毁.
foo.set(Foo { bar: 1 });
println!("=> {} (replaced)", foo.bar);
// Arbitrary writing is unsafe 直接写入字段是不安全的
unsafe { foo.get_unchecked_mut().bar = 2; }
println!("=> {} (written)", foo.bar);
// We can still move if we use get_unchecked_mut(), but it's also unsafe! 通过 unsafe 方法, 还是可以获取到其可变引用的.
let old_foo = unsafe { std::mem::replace(foo.get_unchecked_mut(), Foo { bar: 3 }) };
println!("=> {} (moved)", old_foo.bar);
println!("=> {} (replacement)", foo.bar);
```

```plaintext
=> 0 (initial)
=> 1 (replaced)
=> 2 (written)
=> 2 (moved)
=> 3 (replacement)
```

Managing the self-reference itself is still as unsafe as ever, but by designing our API around to pin the state, we can make sure that whoever actually owns our state is forced to uphold our constraints. For example, for `Future`:

管理自引用本身依然和以往一样不安全, 但通过围绕 `Pin` 设计我们的 API, 可以确保实际持有我们状态的对象必须遵守约束条件. 例如, 对于 `Future` 而言:

```rust,no_run
// std::pin::Pin is special-cased, we can't use arbitrary types as receivers (`self`) yet in stable
// std::pin::Pin 属于特例. 目前在 stable Rust 中我们还不能将任意类型用作接收器 (`self` 类型)
use std::pin::Pin;

trait PinnedFuture<Output> {
    fn poll(self: Pin<&mut Self>) -> Poll<Output>;
}
```

There are also some APIs for pinning things safely. Boxes own their values and their targets are never moved[^15], so wrapping those is fine:

还有一些用于安全地 "固定" 数据的 API. `Box` 拥有其值, 且目标永远不会被移动[^15]，因此这些封装是安全的:

```rust,no_run
impl<T> Box<T> {
    fn into_pin(self) -> Pin<Box<T>> {
        // SAFETY: `Box` owns its value and is never moved, so it will be dropped together with the `Pin`
        unsafe { Pin::new_unchecked(self) }
    }

    fn pin(value: T) -> Pin<Box<T>> {
        Self::new(value).into_pin()
    }
}
```

Finally, we can pin things on the stack! We don't have a special type for "owned-place-on-the-stack", and `&mut T` returns control to the owner once dropped, so that's also not legal. Instead, we need to use the [`pin!`](https://doc.rust-lang.org/stable/std/pin/macro.pin.html) macro to ensure that the original value can never be used:

终于, 我们可以在栈上固定数据了! 由于没有专门表示 "栈分配" 的类型, 而 `&mut T` 一旦被释放就会将控制权归还所有者, 为此, 我们需要使用 [`pin!`](https://doc.rust-lang.org/stable/std/pin/macro.pin.html) 宏来确保原始值永远无法被使用(译者注: 本质是覆盖掉变量名):

```rust,no_run
struct Foo;

let foo = std::pin::pin!(Foo);

// Equivalent to:
let mut foo = Foo;
// SAFETY: `foo` is shadowed in its own scope, so it can never be accessed directly after this point
let foo = unsafe { Pin::new_unchecked(&mut foo) };
```

(std's `pin!` does some special magic to allow it to be used as an expression, but the older [`futures::pin_mut!`](https://docs.rs/futures/latest/futures/macro.pin_mut.html) really did do this.)

(标准库的 `pin!` 通过一些特殊技巧使其可作为表达式使用, 但 [`futures::pin_mut!`](https://docs.rs/futures/latest/futures/macro.pin_mut.html) 更早地实现了这一点. )

## Well, sometimes at least | 好吧, 至少有时候是这样

But if we start defining `Future` in terms of `Pin`.. won't that add a whole bunch of (mental) overhead for the cases that don't require pinning? Suddenly we need to worry about whether all of our `Future`-s are pinned correctly. That seems like a lot of work. We could provide separate `UnpinnedFuture` and `PinnedFuture` traits, but then we have to deal with defining how the two interact. Also not great.

但如果我们在定义 `Future` 时引入 `Pin` 的概念, 对于那些不需要 `Pin` 的情况, 岂不是平添了一堆(心智)负担? 突然间我们得操心所有 `Future` 是否正确使用 `Pin`. 这看起来工作量很大. 我们可以提供独立的 `UnpinnedFuture` 和 `PinnedFuture` 特性, 但随之而来的是要定义两者如何交互. 这也不理想.

That's why Rust provides the [`Unpin`](https://doc.rust-lang.org/stable/std/marker/trait.Unpin.html) marker trait:

正因如此, Rust 提供了 [`Unpin`](https://doc.rust-lang.org/stable/std/marker/trait.Unpin.html) 的标记用 trait:

```rust,no_run
// SAFETY: Only implement for types that can never contain references to themselves.
trait Unpin {}
```

It lets types opt out of pinning, letting you use `Pin<&mut T>` as if it was equivalent to `&mut T` as long as `T` is `Unpin`:

只要 `T` 是 `Unpin`, 就可以像使用 `&mut T` 一样使用 `Pin<&mut T>`:

```rust,no_run
impl<T: Deref> Pin<T>
where
    T::Target: Unpin,
{
    fn new(ptr: T) -> Self {
        // SAFETY: `ptr` is unpinned
        unsafe { Self::new_unchecked(ptr) }
    }

    fn get_mut(&mut self) -> &mut T::Target where T: DerefMut {
        // SAFETY: `ptr` is unpinned
        unsafe { self.get_unchecked_mut() }
    }
}

// Convenience alias for get_mut()
impl<T: DerefMut> DerefMut for Pin<T>
where
    T::Target: Unpin,
{
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.get_mut()
    }
}
```

We can then create and mutate pins as we please.. as long as we stick to `Unpin`-ned data:

只要类型是 `Unpin` 的, 我们就能随心所欲地创建或修改位于 `Pin` 背后的数据...

```rust,no_run
struct Foo {
    bar: u64,
}
impl Unpin for Foo {}

let mut foo = Foo { bar: 0 };
Pin::new(&mut foo).bar = 1;
foo.bar = 2;
```

And as a final nod to convenience.. Rust actually implements `Unpin` by default for new types, as long as they only contain values that are also `Unpin`. Since that's going to exclude types that do contain self-references (`*mut T` is `Unpin` by itself), Rust provides the `PhantomPinned` type which does nothing except be `!Unpin`.[^16] For example:

最后, 为了进一步体现便利性, Rust 默认会为仅包含同样实现了 `Unpin` 的值的自定义类型自动实现 `Unpin`. 由于这仅会排除那些确实包含自引用 (`*mut T` 本身是 `Unpin` 的) 类型, Rust 提供了 `PhantomPinned` 类型(以手动)将自定义类型标记为 `!Unpin`.[^16] 例如:

```rust,no_run
use std::marker::PhantomPinned;

struct ImplicitlyUnpin;
struct ExplicitlyNotUnpin(ImplicitlyUnpin, PhantomPinned);
struct ImplicitlyNotUnpin(ExplicitlyNotUnpin);
struct ExplicitlyUnpin(ImplicitlyNotUnpin);

impl Unpin for ExplicitlyUnpin {}

fn assert_unpin<T: Unpin>() {}
assert_unpin::<ImplicitlyUnpin>;
assert_unpin::<ExplicitlyUnpin>;
// Will fail, since these aren't unpinnable
assert_unpin::<ExplicitlyNotUnpin>;
assert_unpin::<ImplicitlyNotUnpin>;
```

```plaintext
error[E0277]: `PhantomPinned` cannot be unpinned
  --> src/main.rs:16:16
   |
16 | assert_unpin::<ExplicitlyNotUnpin>;
   |                ^^^^^^^^^^^^^^^^^^ within `ExplicitlyNotUnpin`, the trait `Unpin` is not implemented for `PhantomPinned`
   |
   = note: consider using the `pin!` macro
           consider using `Box::pin` if you need to access the pinned value outside of the current scope
note: required because it appears within the type `ExplicitlyNotUnpin`
  --> src/main.rs:6:8
   |
6  | struct ExplicitlyNotUnpin(ImplicitlyUnpin, PhantomPinned);
   |        ^^^^^^^^^^^^^^^^^^
note: required by a bound in `assert_unpin`
  --> src/main.rs:12:20
   |
12 | fn assert_unpin<T: Unpin>() {}
   |                    ^^^^^ required by this bound in `assert_unpin`

For more information about this error, try `rustc --explain E0277`.
error: could not compile `cargomxhoMm` (bin "cargomxhoMm") due to 1 previous error
```

## A little ~~party~~ projection never killed nobody... | 一点小小的~~派对~~投射从不会伤害任何人...

Let's say we have a pinned `Future` like this:

假设我们有一个被固定的 `Future` 如下:

```rust,no_run
struct Timeout<F> {
    inner_future: F,
    elapsed_ticks: u64,
}

let timeout: Pin<&mut Timeout<InnerFuture>>;
```

The safe API on `Pin` only lets us replace our whole `Timeout` (via [`Pin::set`](https://doc.rust-lang.org/stable/std/pin/struct.Pin.html#method.set)), but that's not super useful for us. We need to keep our old `InnerFuture`, that's why we're pinning it to begin with!

`Pin` 的安全API仅允许我们替换整个 `Timeout` (通过[`Pin::set`](https://doc.rust-lang.org/stable/std/pin/struct.Pin.html#method.set)). 但这对我们来说并不十分有用. 我们需要保留旧的 `InnerFuture`, 这正是我们最初 "固定" 它的原因!

To address this, we need to *project* our `InnerFuture`, temporarily splitting our struct into its individual fields while maintaining the pinning requirements.

为了解决这个问题, 我们需要对 `InnerFuture` 进行*投射*, 暂时将结构体拆分为其各个字段, 同时保持 "固定" 的要求.

But that raises another question; should `.inner_future` give a `&mut InnerFuture` or a `Pin<&mut InnerFuture>`? What about `.elapsed_ticks`? The short answer is.. we decide.

但这又引出了另一个问题: `.inner_future` 应该返回 `&mut InnerFuture` 还是 `Pin<&mut InnerFuture>`? `.elapsed_ticks`呢? 简短的答案是... 由我们决定.

From Rust's perspective, either answer is valid as long as we obey the cardinal `Pin` rule that we cannot provide a regular `&mut` once we have produced a `Pin` for a given field.[^17]

从 Rust 的角度来看, 只要遵守 `Pin` 的基本规则——一旦为某个字段生成了 `Pin`, 就不能再提供常规的 `&mut` 引用——两种答案都是有效的.[^17]

From our perspective, we probably want `inner_future` to be `Pin` (since it's also a `Future`), but `elapsed_ticks` doesn't have any reason to be.

从我们的角度来看, 可能希望 `inner_future` 是 `Pin` 的 (因为它也是一个 `Future`). 但 `elapsed_ticks` 没有理由需要是.

Hence, we should write down a single way to project access into each field. One way[^18] would be to write a method for each field:

因此, 我们应该为每个字段的访问投射确定一种统一的方式. 一种方式[^18]是为每个字段编写一个方法:

```rust,no_run
impl<F> Timeout<F> {
    fn inner_future(self: Pin<&mut Self>) -> Pin<&mut F> {
        // SAFETY: `inner_future` is pinned structurally
        unsafe {
            Pin::new_unchecked(&mut self.get_unchecked_mut().inner_future)
        }
    }

    fn elapsed_ticks(self: Pin<&mut Self>) -> &mut u64 {
        // SAFETY: `elapsed_ticks` is _not_ pinned structurally
        unsafe {
            &mut self.get_unchecked_mut().elapsed_ticks
        }
    }
}
```

However, this doesn't allow us to access multiple fields concurrently, since Rust doesn't have a way to express "split borrows" in function signatures at the moment:

然而, 这不允许我们同时访问多个字段, 因为 Rust 目前无法在函数签名中做到 "分别借用":

```rust,no_run
let mut timeout: Pin<&mut Timeout<InnerFuture>> = std::pin::pin!(Timeout { inner_future: InnerFuture, elapsed_ticks: 0 });
let inner_future = timeout.as_mut().inner_future();
let elapsed_ticks = timeout.as_mut().elapsed_ticks();
inner_future.poll();
*elapsed_ticks += 1;
```

```plaintext
error[E0499]: cannot borrow `timeout` as mutable more than once at a time
  --> src/main.rs:38:21
   |
37 | let inner_future = timeout.as_mut().inner_future();
   |                    ------- first mutable borrow occurs here
38 | let elapsed_ticks = timeout.as_mut().elapsed_ticks();
   |                     ^^^^^^^ second mutable borrow occurs here
39 | inner_future.poll();
   | ------------ first borrow later used here

For more information about this error, try `rustc --explain E0499`.
error: could not compile `cargokXjM9v` (bin "cargokXjM9v") due to 1 previous error
```

Instead, we can build a single projection struct that projects access to all fields simultaneously:

相反, 我们可以构建一个单一的投射结构体, 同时实现对所有字段的访问投射:

```rust,no_run
struct TimeoutProjection<'a, F> {
    inner_future: Pin<&'a mut F>,
    elapsed_ticks: &'a mut u64,
}

impl<F> Timeout<F> {
    fn project(mut self: Pin<&mut Self>) -> TimeoutProjection<F> {
        // SAFETY: This function defines the canonical projection for each field
        unsafe {
            let this = self.get_unchecked_mut();
            TimeoutProjection {
                // SAFETY: `inner_future` is pinned structurally
                inner_future: Pin::new_unchecked(&mut this.inner_future),
                // SAFETY: `elapsed_ticks` is _not_ pinned structurally
                elapsed_ticks: &mut this.elapsed_ticks,
            }
        }
    }
}
```

And use it like so:

这样去使用:

```rust,no_run
let mut timeout: Pin<&mut Timeout<InnerFuture>> = std::pin::pin!(Timeout { inner_future: InnerFuture, elapsed_ticks: 0 });
let projection = timeout.project();
let inner_future = projection.inner_future;
let elapsed_ticks = projection.elapsed_ticks;
inner_future.poll();
*elapsed_ticks += 1;
```

Woohoo! This is fine, since we have one method that borrows all of `Timeout`, and produces one `TimeoutProjection` that is equivalent to it. It's okay for the `TimeoutProjection` to borrow multiple things from the Timeout, as long as we (`project()`) know that those borrows are disjoint.[^19]

太棒了! 这没问题, 因为我们有一个方法会借用整个 `Timeout`, 并生成一个与之等效的 `TimeoutProjection`. 只要 `project()` 方法能确保这些借用是互不重叠的, `TimeoutProjection` 从Timeout中借用多个字段也是完全可以的[^19].

But that's still a bit tedious, having to effectively write each struct thrice[^20]. Conveniently enough, [There's A Crate For That](https://docs.rs/pin-project/1.1.10/pin_project/)[^21]. Our `TimeoutProjection` struct could be generated by `pin-project` like this:

不过这样还是有点繁琐, 相当于每个结构体要写三遍[^20]. 幸运的是, [有个现成的库可以解决](https://docs.rs/pin-project/1.1.10/pin_project/)[^21]. 我们的 `TimeoutProjection `结构体可以通过 `pin-project` 这样生成:

```rust,no_run
// Generates `TimeoutProjection` and `Timeout::project()` as above
#[pin_project::pin_project(project = TimeoutProjection)]
struct Timeout<F> {
    #[pin] // Projected as `Pin<&mut F>`
    inner_future: F,
    // No `#[pin]`, projected as `&mut F`
    elapsed_ticks: u64,
}

let mut timeout: Pin<&mut Timeout<InnerFuture>> = std::pin::pin!(Timeout { inner_future: InnerFuture, elapsed_ticks: 0 });
let projection = timeout.project();
let inner_future = projection.inner_future;
let elapsed_ticks = projection.elapsed_ticks;
inner_future.poll();
*elapsed_ticks += 1;
```

Whew. We still have to *call* `Project`[^22], but at least we're mostly back in familiar Rust territory again!

呼. 我们还得*调用* `Project`[^22], 但至少大部分又回到了熟悉的 Rust 领域!

And finally, the same transformation works for enums as well:

最后, 同样的转换对枚举也适用:

```rust,no_run
#[pin_project::pin_project(project = TimeoutProjection)]
enum Timeout<F> {
    Working {
        #[pin]
        inner_future: F,
        elapsed_ticks: u64,
    },
    Expired,
}

// #[pin_project] is equivalent to:
enum ManualTimeoutProjection<'a, F> {
    Working {
        inner_future: Pin<&'a mut F>,
        elapsed_ticks: &'a mut u64,
    },
    Expired,
}
impl<F> Timeout<F> {
    fn manual_project(mut self: Pin<&mut Self>) -> ManualTimeoutProjection<F> {
        // SAFETY: This function defines the canonical projection for each field
        unsafe {
            match self.get_unchecked_mut() {
                Timeout::Working {
                    inner_future,
                    elapsed_ticks,
                } => ManualTimeoutProjection::Working {
                    // SAFETY: `inner_future` is pinned structurally
                    inner_future: Pin::new_unchecked(inner_future),
                    // SAFETY: `elapsed_ticks` is _not_ pinned structurally
                    elapsed_ticks,
                },
                Timeout::Expired => ManualTimeoutProjection::Expired,
            }
        }
    }
}
```

There is, however, one caveat to using `pin-project`: While Rust normally avoids implementing `Unpin` if any field is `!Unpin`, `pin-project` only considers `#[pin]`-ned fields. Normally this is enforced by the type system anyway (since you can't call `self: Pin` methods otherwise), but if you use `PhantomPinned` then it must always be `#[pin]`-ned to be effective.

需要指出, 使用 `pin-project` 时有一个注意事项: 虽然 Rust 通常会在任何字段为 `!Unpin` 时避免实现 `Unpin`, 但 `pin-project` 仅考虑被 `#[pin]` 标记的字段. 通常情况下, 类型系统本身会强制执行这一点 (因为否则无法调用`self: Pin`方法). 但如果使用 `PhantomPinned`, 则必须始终用 `#[pin]` 标记之才能生效.

## Onwards, to the beginning! | 走上正轨!

Okay, now we should finally have the tools to make `TrickOrTreat` safe to interact with!

好的, 现在我们终于有了与 `TrickOrTreat` 安全交互的工具了!

```rust,no_run
use std::{marker::PhantomPinned, task::ready};

struct DemandTreat {
    house: *const House,
    current_house: u16,
}
impl PinnedFuture<Result<Candy, ()>> for DemandTreat {
    fn poll(mut self: Pin<&mut Self>) -> Poll<Result<Candy, ()>> {
        if self.current_house == unsafe { (*self.house).house_number } {
            Poll::Ready(Ok(Candy))
        } else {
            self.current_house += 1;
            Poll::Pending
        }
    }
}
struct PlayTrick {
    house: *const House,
}
impl PinnedFuture<()> for PlayTrick {
    fn poll(self: Pin<&mut Self>) -> Poll<()> { todo!() }
}

#[pin_project::pin_project(project = TrickOrTreatProjection)]
enum TrickOrTreat {
    Init,
    DemandTreat {
        house: House,
        #[pin]
        demand_treat: DemandTreat,
        // SAFETY: self must be !Unpin because demand_treat references house
        #[pin]
        _pin: PhantomPinned,
    },
    PlayTrick {
        house: House,
        #[pin]
        play_trick: PlayTrick,
        // SAFETY: self must be !Unpin because play_trick references house
        #[pin]
        _pin: PhantomPinned,
    },
}
impl PinnedFuture<()> for TrickOrTreat {
    fn poll(mut self: Pin<&mut Self>) -> Poll<()> {
        loop {
            match self.as_mut().project() {
                TrickOrTreatProjection::Init => {
                    self.set(TrickOrTreat::DemandTreat {
                        house: House {
                            street: "Riksgatan".to_string(),
                            house_number: 3,
                        },
                        demand_treat: DemandTreat {
                            house: std::ptr::null(),
                            current_house: 0,
                        },
                        _pin: PhantomPinned,
                    });
                    let TrickOrTreatProjection::DemandTreat { house, mut demand_treat, .. } = self.as_mut().project() else { unreachable!() };
                    demand_treat.house = house;
                }
                TrickOrTreatProjection::DemandTreat { house, demand_treat, .. } => {
                    match ready!(demand_treat.poll()) {
                        Ok(_) => return Poll::Ready(()),
                        Err(_) => {
                            // We need to move the old house out of `self` before we replace it
                            let house = std::mem::replace(house, House {
                                street: String::new(),
                                house_number: 0,
                            });
                            self.set(TrickOrTreat::PlayTrick {
                                house,
                                play_trick: PlayTrick {
                                    // We still don't have the address of house-within-TrickOrTreat::PlayTrick
                                    house: std::ptr::null(),
                                },
                                _pin: PhantomPinned,
                            });
                            let TrickOrTreatProjection::PlayTrick { house, mut play_trick, .. } = self.as_mut().project() else { unreachable!() };
                            play_trick.house = house;
                        },
                    }
                }
                TrickOrTreatProjection::PlayTrick { play_trick, .. } => {
                    ready!(play_trick.poll());
                    return Poll::Ready(());
                },
            }
        }
    }
}
```

## Caveats | 注意事项

I'm honestly still not sure about the best way to represent the self-reference "properly" in the type system.

老实说, 我仍不确定如何在类型系统中 "正确" 表达自引用.

`TrickOrTreat` is safe and self-contained (as long as you only construct `::Init`), but `DemandTreat` and `PlayTrick` are not, since they contain unmanaged raw pointers that could end up dangling. We could use references instead, but I'm honestly not sure about whether `&mut` references could end up causing undefined behaviour due to aliasing. The series is ultimately not about showing what to do, but about explaining some of the magic that is usually hidden from view.

`TrickOrTreat` 可以安全地包含自身 (只要您仅构造 `::Init`). 但 `DemandTreat` 和 `PlayTrick` 则不然, 因为它们包含可能最终悬垂的未管理原始指针. 我们可以改用引用, 但我确实不确定 `&mut` 引用是否会因别名问题导致未定义行为. 这个系列最终不是为了展示该怎么做, 而是为了揭示那些通常隐藏在表象之下的魔法.

## Going forward | 向前迈进

Well.. that took a bit longer than I had meant for it to. But now we're finally through the basic building blocks of an async fn!

呃... 这比我预计的时间要长了些. 不过现在我们总算把异步函数的基本构件都过了一遍!

But an async fn alone isn't all that useful, so next up I'd like to go over how we can use those primitives to run multiple `Future`-s simultaneously in the same thread! Isn't that was asynchronicity was supposed to be all about, anyway?

但光有异步函数本身并不太实用, 所以接下来我想讲讲如何利用这些基础元素, 在同一个线程里同时运行多个`Future`! 这不正是异步本该实现的核心目标吗?

[^1]: If you already know what associated types are.. feel free to skip ahead. This chapter will still be here if you change your mind. 如果你知道关联类型是什么了, 跳过这段也没关系.
[^2]: Hopefully... 希望...
[^3]: And generics. 和泛型.
[^4]: They are both just registered as `MyFuture`: `Future`. 它们都为 `MyFuture` 实现了 `Future`.
[^5]: `x` could have a generic type, but all values. `x` 可以是泛型, 任意的值.
[^6]: No "multiple `impl`s satisfying `_: From<i32>` found" errors here! 并没有 "有多个满足 `_: From<i32>` 的实现" 的错误.
[^7]: Or be `'static`, which is even less helpful for us. 也可以是 `'static` 的, 但于事无补.
[^8]: In fact, it's largely how Tokio 0.1.x worked back in the day. 实际上这就是之前 Tokio 0.1.x 版本的做法.
[^9]: And that it would be relatively cheap to do so. 这会很便宜 (操作廉价).
[^10]: It also requires us to pay the usual costs of reference counting and stack allocation. 这引入了引用计数和堆分配的性能损耗. (译者注: `Arc` 是堆分配.)
[^11]: Sorry. 抱歉.
[^12]: `demand_treat` is dropped after `house`, so if `DemandTreat` implements `Drop` then `demand_treat.house` will be pointing at an object that has already been dropped. `demand_trait` 在 `house` 后被释放, 如果 `DemandTreat` 实现 `Drop`, 则 `demand_treat.house` 将指向内容已被释放的对象.
[^13]: This might not actually crash, if the compiler is able to optimize the no-op move away! But semantically, it's still nonsense. 可能不会崩溃, 如果编译器会优化掉无用的 move 操作. 但语义上是无意义的.
[^14]: Ignore the suspicious `DerefMut` implementation for now. We'll get there eventually. 先忽略这可疑的 `DerefMut` 实现. 我们会讲到它的.
[^15]: Even if we move the `Box` itself, it still points at the same heap allocation in the same location. 即便移动了 `Box`, 但不影响其仍然指向相同的堆内存区域.
[^16]: A bit like how `PhantomData<T>` lets you take on the consequences of storing a type without actually storing anything. 有点像 `PhantomData<T>` 让你能 "存储" 类型而不实际存储任何东西.
[^17]: Unless the field is `Unpin`, of course. 当然, 除非字段 `Unpin`.
[^18]: Arguably, the obvious one. 啊, 最明显的一个.
[^19]: That we don't borrow the same field twice. 由此不会二次借用同一个字段.
[^20]: The struct itself, the projection mirror, and the.. projection function itself. 结构体本身, 投射本身, 以及投射方法本身.
[^21]: At the time of writing, `pin-project` 1.1.10. 在撰文时是 `pin-project` 1.1.10.
[^22]: And keep track of whether utility functions are defined for `&mut Timeout`, `Pin<&mut Timeout>`, or `TimeoutProjection`. 注意方法是定义给 `&mut Timeout`, `Pin<&mut Timeout>`, 还是 `TimeoutProjection` 的.
