<!-- ---
author: Yoshua Wuyts, translated by Hantong Chen
pubDatetime: 2025-02-16T19:00:00.000+08:00
modDatetime: 2025-02-17T20:00:00.000+08:00
title: 细数 Rust 那些迭代器 (Iterator)
featured: true
draft: false
tags:
  - rust
  - translation
  - twir
description: 现有的 Iterator trait 在处理许多重要需求时捉襟见肘, 如异步 Iterator 等, 怎么办? 作者在本文系统梳理了各类迭代器变体, 为 Iterator 这一在 Rust 中至关重要的概念的发展给出了自己的思考与建议. "哦, 我的老伙计, 你喜欢迭代器吗? 尝试把它们的名字都列出来..."
--- -->

> `This Week in Rust (TWiR)` Rust 语言周刊中文翻译计划, 第 586 期
>
> 本文翻译自 Yoshua Wuyts 的博客文章 [https://blog.yoshuawuyts.com/a-survey-of-every-iterator-variant](https://blog.yoshuawuyts.com/a-survey-of-every-iterator-variant), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 2 月 17 日晚, 于广州.

译者前言: 本文作者梳理了一些标准库中存在或作者希望存在的迭代器, 迭代器作为 Rust 中的重要概念, 值得认真了解. 作者给出的部分设想其实也能以子 trait 的方式自行实现, 不妨将其作为练习; 当然, 大部分设想都需要改动标准库甚至编译器实现, 所以了解其思想即可! 援引作者的一句话: "`Iterator` is probably the single-most complex trait in the language. It is a junction in the language where every effect, auto-trait, and lifetime feature ends up intersecting."

## Introduction

> Oh yeah, you like iterators? Name all of them.\
> 哦, 我的老伙计, 你喜欢迭代器吗? 尝试把它们的名字都列出来...

I'm increasingly of the belief that before we can meaningfully discuss the solution space, we have to first make an effort to build consensus on the problem space. It's hard to plan for a journey together if we don't know what the trip will be like along the way. Or worse: if we don't agree in advance where we want the journey to take us.

探讨问题的各种解决方案前, 让我们先探讨问题所在.

In Rust the `Iterator` trait is the single-most complex trait in the stdlib. It provides 76 methods, and by my estimate (I stopped counting at 120) has around 150 trait implementations in the stdlib alone. It also features a broad range of extension traits like `FusedIterator` and `ExactSizeIterator` that provide additional capabilities. And it is itself a trait-based expression of one of Rust's core control-flow effects; meaning it is at the heart of a lot of interesting questions about how we combine such effects.

在 Rust 中, `Iterator` trait 是标准库中最为复杂的 trait. 它提供了 76 个方法, 据我估算(数到 120 时我就不数了), 仅在标准库中就有大约 150 个 trait 实现.
它还包含一系列扩展 trait (如 `FusedIterator` 和 `ExactSizeIterator`), 这些扩展 trait 提供了额外的方法.
同时, 它本身作为基于 trait 的表达方式, 体现了 Rust 核心控制流机制之一——这意味着它处于许多关于如何组合这些控制流机制的有趣问题的核心位置.

Despite all that we know the `Iterator` trait falls short today and we would like to extend it to do more. Async iteration is one popular capability people are missing as a built-in. Another is the ability to author address-sensitive (self-referential) iterators. Less in the zeitgeist but equally important are iterators that can lend items with a lifetime, conditionally terminate early, and take external arguments on each call to `next`.

尽管 `Iterator` trait 已经如此强大, 但我们知道它目前仍有不足, 并希望扩展其功能.
人们普遍期待 Rust 能内置支持异步迭代器, 以及地址敏感(自引用)迭代器.
此外, 虽然关注度较低但同样重要的功能包括: 能够以一定生命周期借出元素的迭代器、条件提前终止的迭代器, 以及在每次调用 `next` 方法时接收外部参数的迭代器.

I'm writing this post to enumerate all of the iterator variants in use in Rust today. So that we can scope the problem space to account for all of them. I'm also doing this because I've started hearing talk about potentially (soft-)deprecating `Iterator`. I believe we only get one shot at running such a deprecation[^1], and if we are going to do one we need to make sure it's a solution that will plausibly get us through all of our known limitations. Not just one or two.

我撰写此文的目的, 是希望系统梳理当前 Rust 中使用的所有迭代器变体, 从而明确问题范围以涵盖所有可能性.
之所以进行这项梳理, 是因为我近期开始听到关于可能(软性)弃用 `Iterator` 的讨论. 我相信这类弃用操作只有一次机会[^1], 并且如果决定这么做, 就必须确保提出的解决方案能够合理突破目前已知的所有限制, 而不仅仅是解决其中一两个问题.

So without further ado: let's enumerate every variation of the existing `Iterator` trait we know we want to write, and discuss how those variants interact with each other to create interesting new kinds of iterators.

因此, 事不宜迟: 让我们细数 `Iterator` trait 现有的各种变体, 并讨论它们如何相互交互以创建有趣的新类型的迭代器.

## Base Iterator | 基础的迭代器

`Iterator` is a trait representing the stateful component of iteration; `IntoIterator` represents the capability for a type to be iterated over. Here is the `Iterator` trait as found in the stdlib today. The Iterator and IntoIterator traits are closely linked, so throughout this post we will show both to paint a more complete picture.

`Iterator` 是一个代表迭代状态组成部分的 trait; `IntoIterator` 则代表类型具备被迭代的能力. `Iterator` 和 `IntoIterator` 是紧密相连的, 本文将充分结合二者叙述.

Throughout this post we will be covering variations on Iterator which provide new capabilities. This trait ~~is~~ represents the absence of those capabilities: it is blocking, cannot be evaluated during compilation, is strictly sequential, and so on. Here is what the foundation of the `core::iter` submodule looks like today:

在本文中, 我们将探讨 `Iterator` 的多种变体, 这些变体能够提供新的能力.
当前的 `Iterator` trait 并不具备这些特性: 它是阻塞式的、无法在编译时求值、严格按顺序执行等.
以下是当前 `core::iter` 子模块的基础概览:

```rust
/// An iterable type.
/// 能被迭代的类型
pub trait IntoIterator {
    /// The type of elements yielded from the iterator.
    /// 转化为迭代器后, 迭代元素的类型
    type Item;
    /// Which kind of iterator are we turning this into?
    /// 这个类型转化为迭代器后, 迭代器自身的类型
    type IntoIter: Iterator<Item = Self::Item>;
    /// Returns an iterator over the elements in this type.
    /// 将自身转化并返回一个迭代器
    fn into_iter(self) -> Self::IntoIter;
}

/// A type that yields values, one at the time.
/// 一种每次迭代产生一个值的类型
pub trait Iterator {
    /// The type of elements yielded from the iterator.
    /// 迭代元素的类型
    type Item;
    /// Advances the iterator and yields the next value.
    /// 迭代并返回下一个值
    fn next(&mut self) -> Option<Self::Item>;
    /// Returns the bounds on the remaining length of the iterator.
    /// 返回迭代器剩下的长度的范围
    fn size_hint(&self) -> (usize, Option<usize>) { .. }
}
```

While not strictly necessary: the associated `IntoIterator::Item` type exists for convenience. That way people using the trait can directly specify the Item using impl IntoIterator<Item = Foo>, which is a lot more convenient than I: <IntoIterator::IntoIter as Iterator>::Item, etc.

虽然并非严格必要: 方便起见, 存在关联类型 `IntoIterator::Item`, 以避免 `I: <IntoIterator::IntoIter as Iterator>::Item` 的繁杂写法.

## Bounded Iterator | 有界迭代器

The base Iterator trait represents a potentially infinite (unbounded) sequence of items. It has a `size_hint` method that returns how many items the iterator still expects to yield. That value is however not guaranteed to be correct, and is intended to be used for optimizations only. From the docs:

基础 `Iterator` trait 实际上隐含无限序列的意思. 它具有 `size_hint` 方法, 返回当前迭代器还期望(但不精确)产生多少元素, 旨在仅用于优化. 文档有言:

> *Implementation notes* It is not enforced that an iterator implementation yields the declared number of elements. A buggy iterator may yield less than the lower bound or more than the upper bound of elements.\
> *实现(本 trait 的)温馨提示* 不强制迭代器实现需要产生声明的元素数量, 错误的迭代器实现可能产生数量小于下限或高于上限的元素.\
> `size_hint()` is primarily intended to be used for optimizations such as reserving space for the elements of the iterator, but must not be trusted to e.g., omit bounds checks in unsafe code. An incorrect implementation of size_hint() should not lead to memory safety violations.\
> `size_hint()` 主要意图为优化, 例如为迭代器的元素保留空间, 但绝对不能盲目信任, 例如在不安全的代码中直接省略界限检查. `size_hint()` 的不正确实现不应导致内存安全问题.

The Rust stdlib provides two `Iterator` subtraits that allow it to guarantee it is bounded: `ExactSizeIterator` (stable) and `TrustedLen` (unstable). Both traits take `Iterator` as its super-trait bound and on its surface seem nearly identical. But there is one key difference: `TrustedLen` is unsafe to implement allowing it to be used to guarantee safety invariants.

Rust 标准库提供了 `Iterator` 的两个子 trait, 使可以保证其有界: `ExactSizeIterator` (stable) 和 `TrustedLen` (nightly).
这两个特征都将 `Iterator` 作为父 trait, 并且表面上似乎几乎相同. 但是它们有个关键区别: `TrustedLen` 是 unsafe 的.

```rust
/// An iterator that knows its exact length.
pub trait ExactSizeIterator: Iterator {
    /// Returns the exact remaining length of the iterator.
    fn len(&self) -> usize { .. }
    /// Returns `true` if the iterator is empty.
    fn is_empty(&self) -> bool { .. }
}

/// An iterator that reports an accurate length using `size_hint`.
#[unstable(feature = "trusted_len")]
pub unsafe trait TrustedLen: Iterator {}
```

`ExactSizeIterator` has the same memory-safety guarantees as `Iterator::size_hint` meaning: you can't rely on it to be correct. That means that if you're say, collecting items from an iterator into a vec, you can't omit bounds checks and use `ExactSizeIterator::len` as the input to `Vec::set_len`. However if `TrustedLen` is implemented bounds checks can be omitted, since the value returned by size_hint is now a safety invariant of the iterator.

`ExactSizeIterator` 具有与 `Iterator::size_hint` 含义相同的内存安全保证: 您不能信任它是正确的.
这意味着如果您将元素从迭代器收集到 `Vec` 中, 不能省略边界检查而使用 `ExactSizeIterator::len` 作为 `Vec::set_len` 的输入, 但还实现了 `TrustedLen` 的除外(译者注: 这也是为什么这是个 unsafe trait).

## Fused Iterator | Fused 迭代器

(译者注: `fused` 这个概念实在不知道怎么翻译合适, 保留不译. 大意即完成迭代后保证不再有新元素可供迭代. 这个概念在 future -> Stream 里面也有见到.)

When working with an iterator, we typically iterate over items until the iterator yields None at which point we treat the iterator as "done". However the documentation for Iterator::next includes the following:

使用迭代器时, 我们通常会迭代直到产生 `None`, 此时我们将迭代器视为 "完成". 但是, `Iterator::next` 的文档明确说道:

> Returns `None` when iteration is finished. Individual iterator implementations may choose to resume iteration, and so calling `next()` again may or may not eventually start returning `Some(Item)` again at some point.\
> 迭代完成后返回 `None`. 单个迭代器实现可以选择恢复迭代, 因此再次调用 `next()` 可能会在某个时候再次开始返回 `Some(Item)`.

It's rare to work with iterators which yield None and then resume again afterwards, but the iterator trait explicitly allows it. Just like it allows for an iterator to panic if next is called again after None has been yielded once. Luckily the FusedIterator subtrait exists, which guarantees that once None has been yielded once from an iterator, all future calls to next will continue to yield None.

很少见这种情况, 但是确实是允许的. 就像如果 `next` 返回 `None` 后再次调用一次 `next` 时, panic 也是允许的.
幸运的是, 存在 `FusedIterator` 子 trait, 它可以保证一旦 `None` 从迭代器中产生一次, 将来对 `next` 的调用都将继续产生 `None`.

```rust
/// An iterator that always continues to yield `None` when exhausted.
pub trait FusedIterator: Iterator {}
```

Most iterators in the stdlib implement `FusedIterator`. For iterators which aren't fused, it's possible to call the `Iterator::fuse` combinator. The stdlib docs recommend never taking a `FusedIterator` bound, instead favoring `Iterator` in bounds and calling fuse to guarantee the fused behavior. For iterators that already implement `FusedIterator` this is considered a no-op.

标准库中的大多数迭代器都实现了 `FusedIterator`. 对于非 Fused 的迭代器, 可以调用 `Iterator::fuse` 组合器.
标准库文档不建议引入 `FusedIterator` 的约束, 而应该对 `Iterator` 调用 `fuse` 方法来保证迭代是 fused 的(返回 `None` 后就再也不会返回 `Some(Item)` 了).
对于已经实现 `FusedIterator` 的迭代器而言, 这被认为是一个空操作.

The `FusedIterator` design works because `Option::None` is idempotent: there is never a scenario where we can't create a new instance of `None`. Contrast this with enums such as `Poll` that lack a "done" state - and you see ecosystem traits such as FusedFuture attempting to add this lack of expressivity back through other means. The need for an idempotent "done" state will be important to keep in mind as we explore other iterator variants throughout this post.

`FusedIterator` 的设计之所以起作用, 是因为 `Option::None` 是幂等的(译者注: 大意即不管 `Option::<T>::None` 的 `T` 是什么, `None` 就是 `None`): 无论调用多少次 `next` 方法, 一旦迭代器终止, 我们永远不可能遇到无法创建新的 None 实例的情况.
与此形成对比的是像 `Poll` 这样的枚举类型——它们缺乏明确的 "完成" 状态, 因此生态系统需要通过 `FusedFuture` 等 trait 以其他方式补足这种表达能力.
幂等的 "完成" 状态需求在本文后续探讨其他迭代器变体时尤为重要, 需要时刻牢记.

## Thread-Safe Iterator | 线程安全的迭代器

Where bounded and fused iterators can be obtained by refining the Iterator trait using subtraits, thread-safe iterators are obtained by composing the Send and Sync auto-traits with the Iterator trait. That means there is no need for dedicated SendIterator or SyncIterator traits. A "thread-safe iterator" becomes a composition of Iterator and Send / Sync:

区别于需要使用子 trait 完善 `Iterator` trait 来获得有界或 fused 的迭代器, `Send` 和 `Sync` 作为 auto trait, 意味着不需要专门的如 `SendIterator` 或 `SyncIterator` 般的子 trait, "线程安全的迭代器" 即 `Iterator` + `Send` / `Sync`:

```rust
struct Cat;

// Manual `Iterator` impl
impl Iterator for Cat { .. }

// These impls are implied by `Send`
// and `Sync` being auto-traits
unsafe impl Send for Cat {}
unsafe impl Sync for Cat {}
```

And when taking impls in bounds, we can again express our intent by composing traits in bounds. I've made the argument before that taking Iterator directly in bounds is rarely what people actually want, so the bound would end up looking like this:

落实到应用上, trait 约束看起来像这样:

```rust
fn thread_safe_sink(iter: impl IntoIterator + Send) { .. }
```

If we also want the individual items yielded by the iterator to be marked thread-safe, we have to add additional bounds:

如果我们还希望迭代器所产生的元素是线程安全的, 还需要对 `Item` 约束:

```rust
fn thread_safe_sink<I>(iter: I)
where
    I: IntoIterator<Item: Send> + Send,
{ .. }
```

While there is no lack of expressivity here, at times bounds like these can get rather verbose. That should not be taken as indictment of the system itself, but rather as a challenge to improve the ergonomics for the most common cases.

尽管不缺乏表现力, 这里的 trait 约束偶尔会相当繁杂. 当然这不应将其视为对实现本身的控诉, 而应将其作为改善最常见情况的人体工程学的挑战.

(译者注: 遇到线程安全的实现, `Send` + `Sync` 的约束确实会满天飞. 引入它们也是为了内存安全着想, 我认为是比较优秀的设计, 复杂一点可以接受.)

## Dyn-Compatible Iterator | dyn 兼容的迭代器

(译者注: 之前叫 object safe, 但容易引起误解, 现在改说法了, 参见 [https://github.com/rust-lang/lang-team/issues/286](https://github.com/rust-lang/lang-team/issues/286))

Dyn-compatibility is another axis that traits are divided on. Unlike e.g. thread-safety, dyn-compatibility is an inherent part of the trait and is governed by Sized bounds. Luckily both the Iterator and IntoIterator traits are inherently dyn-compatible. That means they can be used to create trait objects using the dyn keyword:

`dyn` 兼容性是 trait 的又一特征. 不像线程安全性, `dyn` 兼容性是 trait 的固有部分, 遵循 `Sized` 约束. 幸运的是, `Iterator` 和 `IntoIterator` 的特征本质上都是 `dyn` 兼容的. 这意味着它们可以使用 `dyn` 关键字来创建 trait 对象:

```rust
struct Cat;
impl Iterator for Cat { .. }

let cat = Cat {};
let dyn_cat: &dyn Iterator = &cat; // ok
```

There are some iterator combinators such as [`count`](https://doc.rust-lang.org/std/iter/trait.Iterator.html#method.count) that take an additional `Self: Sized` bound[^2]. But because trait objects are themselves sized, it all mostly works as expected:

有一些方法(例如 [`count`](https://doc.rust-lang.org/std/iter/trait.Iterator.html#method.count)) 需要额外的 `Self: Sized` 约束[^2], 但多数都满足.

```rust
let mut cat = Cat {};
let dyn_cat: &mut dyn Iterator = &mut cat;
assert_eq!(dyn_cat.count(), 1); // ok
```

## Double-Ended Iterator | 双端迭代器

(译者注: 也可译作 `双向迭代器`, 但 `VecDeque` 常译作双端队列, 故此处译为 `双端迭代器`)

Often times iterators over collections hold all data in memory, and can be traversed in either direction. For this purpose Rust provides the `DoubleEndedIterator` trait. Where Iterator builds on the `next` method, `DoubleEndedIterator` builds on a `next_back` method. This allows items to be taken from both the logical start and end of the iterator. And once both cursors meet, iteration is considered over.

通常, 对集合 (collection) 的迭代器将所有数据保存在内存中, 并且可以沿任一方向遍历.
为此, Rust 提供了 `DoubleEndedIterator` trait. 其中 `Iterator` 提供 `next` 方法, `DoubleEndedIterator` 提供 `next_back` 方法. 这允许从迭代器的逻辑始端和末端获取元素. 一旦两个光标相遇, 迭代就会结束.

```rust
/// An iterator able to yield elements from both ends.
pub trait DoubleEndedIterator: Iterator {
    /// Removes and  an element from the end of the iterator.
    fn next_back(&mut self) -> Option<Self::Item>;
}
```

While you'd expect this trait to be implemented for e.g. `VecDeque`, it's interesting to note that it's also implemented for `Vec`, `String`, and other collections that only grow in one direction. Also unlike some of the other iterator refinements we've seen, `DoubleEndedIterator` has a required method that is used as the basis for several new methods such as `rfold` (reverse fold) and `rfind` (reverse find).

`VecDeque` 是意料之中的实现此 trait 的类型, 但有趣的是, `Vec`, `String` 或其他本仅在一个方向增长的集合也实现了此 trait.
与我们前面所述的迭代器不同, `DoubleEndedIterator` 有一必需的方法 (译者注: required method, 即需要你实现没有默认实现的方法, 后者称 provided method), 该方法被用作几种新方法的基础, 例如 `rfold` (反向 fold, reverse fold) 和 `rfind` (反向寻找, reverse find).

## Seeking Iterator | 定位迭代器

Both the `Iterator` and `Read` traits in Rust provide abstractions for streaming iteration. The main difference is that `Iterator` works by returning arbitrary owned types when calling next, where `Read` is limited to reading bytes into buffers. But both abstractions keep a cursor that keeps track of which data has been processed already, and which data still needs processing.

Rust 中的 `Iterator` 和 `Read` 特征都为流的迭代提供了抽象.
主要区别在于, `Iterator` 在调用 `next` 方法返回的是 owned 的类型 (译者注: owned / borrowed 是 Rust 所有权特有的概念, 不译), 而 `Read` 仅限于从缓冲区读取字节. 但是, 这两个抽象都保持了一个光标 (cursor), 以跟踪已经处理了哪些数据, 并且哪些数据仍需要处理.

But not all streams are created equally. When we read data from a regular file[^3] on disk we can be sure that, as long as no writes occurred, we can read the same file again and get the same output. That same guarantee is however not true for sockets, where once we've read data from it we can't read that same data again. In Rust this distinction is surfaced via the `Seek` trait, which gives control over the `Read` cursor in types that support it.

但是, 各类流的特性并不是一致的.
当我们读取磁盘上的常规文件时[^3], 我们可以断言, 只要没有写入, 再次读取会获得相同的输出.
但从网络套接字读取字节流时并没有类似的保证, 一旦我们从中读取了数据, 我们就无法再次读取相同的数据 (译者注: 数据会从网络栈的底层缓冲区移出. 当然你也可以使用 `MSG_PEEK` 操作, 这就是后话了).
在 Rust 中, 这种区别通过 `Seek` trait 表现出来, 其提供了一个可以在字节流中移动的光标.

In Rust the `Iterator` trait provides no mechanism to control the underlying cursor, despite its similarities to `Read`. A language that does provide an abstraction for this is C++ in the form of `random_access_iterator`. This is a C++ concept (trait-alike) that further refines bidirectional_iterator. My C++ knowledge is limited, so I'd rather quote the docs directly than attempt to paraphrase:

在 Rust 中, 尽管 `Iterator` trait 与 `Read` 相似, 但没有提供控制光标的机制.
确实为此提供抽象的语言是 C++, 以 `random_access_iterator` 的形式. 这是一个 C++ 中进一步完善 `bidirectional_iterator` 的 concept (类似 trait).
我的 C++ 知识是有限的, 因此我宁愿直接引用文档而不是试图解释:

> [...] `random_access_iterator` refines `bidirectional_iterator` by adding support for constant time advancement with the `+=`, `+`, `-=`, and `-` operators, constant time computation of distance with `-`, and array notation with subscripting `[]`.\
> [...] `random_access_iterator` (随机访问迭代器) 在 bidirectional_iterator (双向迭代器) 的基础上进一步改进, 新增了对以下功能的支持: 通过 `+=`、`+`、`-=` 和 `-` 运算符实现常数时间内的迭代器(光标)移动; 通过 `-` 运算符以常数时间计算迭代器间的距离; 通过下标运算符 `[]` 实现类似数组的随机访问.

Being able to directly control the cursor in Iterator implementations could prove useful when working with in-memory collection types like `Vec`, as well as when working with remote objects such as paginated API endpoints. The obvious starting point for such a trait would be to mirror the existing `io::Seek` trait and adapt it to be a subtrait of Iterator:

能够直接控制 `Iterator` 中的光标在处理数据保存于内存的集合 (如 `Vec`) 以及远程对象(例如可分页的 API endpoints)时相当实用.
实现这个 trait 的起点明显是镜像现有的 `io::Seek` trait, 并将其改造为为 `Iterator` 的子 trait:

```rust
/// Enumeration of possible methods to seek within an iterator.
pub enum SeekFrom {
    /// Sets the offset to the specified index.
    Start(usize),
    /// Sets the offset to the size of this object plus the specified index.
    End(isize),
    /// Sets the offset to the current position plus the specified index.
    Current(isize),
}

/// An iterator with a cursor which can be moved.
pub trait SeekingIterator: Iterator {
    /// Seek to an offset in an iterator.
    fn seek(&mut self, pos: SeekFrom) -> Result<usize>;
}
```

## Compile-Time Iterator | 编译时迭代器

In Rust we can use `const {}` blocks to execute code during compilation. Only const fn functions can be called from `const {}` blocks. const fn free functions and methods are stable, but const fn trait methods are not. This means that traits like Iterator are not yet callable from `const {}` blocks, and so neither are for..in expressions.

在 Rust 中, 我们可以使用 `const {}` 块在编译时执行代码. `const {}` 块只能调用 `const` 方法, 然而 [`const_trait_impl`](https://github.com/rust-lang/rust/issues/67792) feature 仍不稳定. 这意味着 `Iterator` 之类的 trait 的方法不能在 `const {}` 块中调用, 自然 `for..in` 表达式也不行 (译者注: 不过有个 `const_for` 的三方库).

We know we want to support iteration in `const {}` blocks, but we don't yet know how we want to spell both the trait declaration and trait bounds. The most interesting open question here is how we will end up passing the `Destruct` trait around, which is necessary to enable types to be droppable in const contexts. This leads to additional questions around whether const trait bounds should imply const `Destruct`. And whether the const annotation should be part of the trait declaration, the individual methods, or perhaps both.

我们需要支持在 `const {}` 块中进行迭代操作, 但目前尚未确定如何设计 trait 声明 (trait declaration) 和 trait 约束 (trait bounds) 的具体语法.
当前最关键的开放性问题在于如何传递 `Destruct` trait, 这是确保类型在常量上下文中可被丢弃 (droppable) 的必要条件. 这进一步引发了以下讨论:

- const trait 约束 (const trait bounds) 是否应隐式包含 const `Destruct`.
- const 是应作为 trait 声明的一部分、单个方法的修饰, 还是需要同时出现在两者中.

This post is not the right venue to discuss all tradeoffs. But to give a sense of what a compile-time-compatible `Iterator` trait might look like: here is a variant where both the trait and individual methods are annotated with const:

这篇文章不讨论各类权衡. 但是我们还是给出 const compatible 的 `Iterator` 可能的样子, 特征和单个方法都是 `const` 的:

(译者注: 相当破坏性了, 那我们手动实现的 `Iterator` 没办法让方法 const 怎么办... 但是最关键的还是那几个方法能不能 const... 总不能 optional const 吧, 或者妥协一点, `ConstIterator` 的玩意...)

```rust
pub const trait IntoIterator {                        // ← `const`
    type Item;
    type IntoIter: const Iterator<Item = Self::Item>; // ← `const`
    const fn into_iter(self) -> Self::IntoIter;      // ← `const`
}

pub const trait Iterator {                                     // ← `const`
    type Item;
    const fn next(&mut self) -> Option<Self::Item>;           // ← `const`
    const fn size_hint(&self) -> (usize, Option<usize>) { .. } // ← `const`
}
```

## Lending Iterator | 借用迭代器

While there are plenty of iterators in the stdlib today that yield references to items, the values that are being referenced are never owned by the iterator itself. In order to write iterators which owns the items it yields and yields them by-reference, the associated item type in iterator needs a lifetime:

尽管当今标准库中有很多迭代器会引起对父体元素的引用, 但所引用的元素从未由迭代器本身所有. 为了编写拥有一定量元素并返回其引用的迭代器, `Iterator` trait 中的关联类型需要生命周期:

```rust
pub trait IntoIterator {
    type Item<'a>                                               // ← Lifetime
    where
        Self: 'a;                                              // ← Bound
    type IntoIter: for<'a> Iterator<Item<'a> = Self::Item<'a>>; // ← Lifetime
    fn into_iter(self) -> Self::IntoIter;
}

pub trait Iterator {
    type Item<'a>                                 // ← Lifetime
    where
        Self: 'a;                                // ← Bound
    fn next(&mut self) -> Option<Self::Item<'_>>; // ← Lifetime
    fn size_hint(&self) -> (usize, Option<usize>) { .. }
}
```

There has been talk about adding a 'self lifetime to the language as a shorthand for where Self:'a. But even with that addition this set of signatures is not for the faint of heart. The reason for that is that it makes use of GATs, which are both useful and powerful — but are for all intents and purposes an expert-level type-system feature, and can be a little tricky to reason about.

关于在语言中添加 `'self` 生命周期 (作为 `where Self: 'a` 的简写形式) 已有过一些讨论. 但即使这样, 其函数签名也并非轻易可以驾驭, 原因在于它们使用了泛型关联类型 (GATs): 虽然功能强大且实用, 但从本质上说属于专家级的类型系统功能, 其逻辑推理可能需要一定的技巧才能掌握.

Lending iteration is also going to be important when we add dedicated syntax to construct iterators using the `yield` keyword. The following example shows a `gen {}` block which creates a string and then yields a reference to it. This perfectly[^4] matches onto the `Iterator` trait we’ve defined:

当我们使用 `yield` 关键字构建迭代器时, 借用迭代也将很重要. 下面的示例给出一个 `gen {}` 块(译者注: 产生迭代器的新语法, 暂且称生成器), 该块创建了一个字符串, 然后返回其引用, 完美[^4]匹配我们定义的 `Iterator` trait:

```rust
let iter = gen {
    let name = String::from("Chashu");
    yield &name; // ← Borrows a local value stored on the heap.
};
```

## Iterator with a Return Value | 带返回值的迭代器

The current Iterator trait has an associated type `Item`, which maps to the `yield` keyword in Rust. But it has no associated type that maps to the return keyword. A way to think about iterators today is that their return type is hard-coded to unit. If we want to enable generator functions and blocks to be written which can not just yield, but also return, we'll need some way to express that.

当前 `Iterator` trait 有个关联类型 `Item`, 该类型映射到 `yield` 关键字. 但是没有能映射到 `return` 关键字的关联类型. 目前可以认为, 它们的返回类型被硬编码为 unit. 如果我们需要在生成器内不仅可以 `yield` 还可以 `return`, 我们将需要某种方法来表达这一点:

```rust
let counting_iter = gen {
    let mut total = 0;
    for item in iter {
        total += 1;
        yield item;     // ← Yields one type.
    }
    total                // ← Returns another type.
};
```

The obvious way to write a trait for "an iterator which can return" is to give Iterator an additional associated item Output which maps to the logical return value. In order to be able to express fuse semantics, the function next needs to be able to return three different states:

为实现 "可以返回的迭代器", 显然可以给 `Iterator` 添加一个叫 `Output` 的关联类型(译者注: 而且并不是破坏性的操作, 给定默认就是 unit 类型就可以), 映射到逻辑返回值. 为了能够表达融合语义, `next` 方法需要能够返回三个不同的状态:

- Yielding the associated type Item

  产生 Item
- Returning the associated type Output

  返回 Output
- The iterator has been exhausted (done)

  迭代器已经用尽(完成)

One way to do this would be for next to return `Option<ControlFlow>`, where Some(Continue) maps to yield, Some(Break) maps to return, and None maps to done. Without a final "done" state, calling next again on an iterator after it's finished yielding values would likely always have to panic. This is what most futures do in async Rust, and is going to be a problem if we ever want to guarantee panic-freedom.

做到这一点的一种方法是返回 `Option<ControlFlow>`, 其中 `Some(Continue)` 对应 `yield`, `Some(Break)` 对应 `return`, `None` 对应完成.
如果没有最终的 "完成" 状态, 在完成后再次调用 `next` 存在总是会 panic 的情况.
这就是多数异步 Rust 实现中所做的事情, 如果我们想保证尽量不要 panic, 这将是一个问题.

```rust
pub trait IntoIterator {
    type Output;                                           // ← Output
    type Item;
    type IntoIter:
        Iterator<Output = Self::Output, Item = Self::Item>; // ← Output
    fn into_iter(self) -> Self::IntoIter;
}

pub trait Iterator {
    type Output;                                          // ← Output
    type Item;
    fn next(&mut self)
        -> Option<ControlFlow<Self::Output, Self::Item>>; // ← Output
    fn size_hint(&self) -> (usize, Option<usize>) { .. }
}
```

The way this would work on the caller side and in combinators is quite interesting. Starting with the provided `for_each` method: it will want to return `Iterator::Output` rather than `()` once the iterator has completed. Crucially the closure `F` provided to `for_each` only operates on `Self::Output`, and has no knowledge of `Self::Output`. Because if the closure did have direct knowledge of Output, it could short-circuit by returning Output sooner than expected which is a different kind of iterator than having a return value.

这种方法在调用方和组合器中的工作方式非常有趣. 从 `for_each` (provided method)开始: 它希望在迭代器完成后返回 `Iterator::Output` 而不是 `()`.
关键是, 提供给 `for_each` 的闭包 `F` 仅对 `Self::Output` 进行操作, 并且对 `Self::Output` 没有直接的关系. 因为如果闭包确实对 `Output` 有直接关系, 它可能会通过比预期更早地返回 `Output` 来短路返回, 这与具有返回值的迭代器是不同类型的迭代器.

```rust
fn for_each<F>(self, f: F) -> Self::Output // ← Output
where
    Self: Sized,
    F: FnMut(Self::Item),
{ .. }
```

If we were to transpose "iterator with return value" to for..in things get even more interesting still. In Rust loop expressions can themselves evaluate to non-unit types by calling break with some value. for..in expressions cannot do this in the general case yet, except for the handling of errors using ?. But it's not hard to see how this could be made to work, conceptually this is equivalent to calling `Iterator::try_for_each` and returning `Some(Break(value))`:

如果我们要将 "带有返回值的迭代器" 转换为 `for...in`, 那么事情就会变得更加有趣.
在 Rust loop 中, 可以通过以某种方式调用 `break`, 藉由推断返回值类型. 但在一般情况下, `for..in` 表达式无法做到这一点, 除了使用 `?` 处理错误.
但是, 不难看出如何处理这种情况, 从概念上讲, 这等同于调用 `Iterator::try_for_each` 和返回 `Some(Break(value))`:

```rust
let ty: u32 = for item in iter {  // ← Evaluates to a `u32`
    break 12u32                   // ← Calls `break` from the loop body
};
```

Assuming we have an `Iterator` with its own return value, that would mean for..in expressions would be able to evaluate to non-unit return types without calling break from within the loop's body:

假设我们有一个具有明确返回值的 `Iterator`, 那意味着 `for..in` 表达式将能够推断非 Unit 的返回类型, 而无需从循环体中调用 break:

```rust
let ty: u32 = for item in iter {  // ← Evaluates to a `u32`
    dbg!(item);                  // ← Doesn't `break` from the loop body
};
```

(译者注: 那如上面的例子, 返回啥玩意呢...)

This of course leads to questions about how to combine an "iterator with a return value" and "using break from inside a for..in expression". I'll leave that as an exercise to the reader on how to spell out (I'm certain it can be done, I just think it's a fun one). Generalizing all modes of early returns from for..in expressions to invocations of `for_each` combinators is an interesting challenge that we'll cover in more detail later on when we discuss short-circuiting (fallible) iterators.

当然, 这会导致有关如何将 "具有返回值的迭代器" "和 "从 `for...in` 表达式内部使用 break" 相结合的问题. 我将把它作为一个练习, 以使读者了解如何实现这点(我敢肯定可以做到这一点, 我只是认为这是一个有趣的事情). 将 `for...in` 表达式的所有早期返回模式概括为 `for_each` 组合器的调用是一个有趣的挑战, 我们稍后将在讨论可短路(可失败)迭代器时更详细地介绍.

## Iterator with a Next Argument | 带有下一个参数的迭代器

In generator blocks the `yield` keyword can be used to repeatedly yield values from an iterator. But what if the caller doesn't just want to obtain values, but also pass new values back into the iterator? That would require for yield to be able evaluate to a non-unit type. Iterators that have this functionality are often referred to as "coroutines", and they are being particularly useful when implementing I/O-Free Protocols.

在生成器块中, `yield` 关键字可用于从迭代器中反复产生值. 但是, 如果调用者不仅想获得值, 还想将新值传递回迭代器怎么办? 这需要 `yield` 能够推断为非单元类型. 具有此功能的迭代器通常被称为 "coroutines", 在实现 I/O 无关的协议时, 它们特别有用.

```rust
/// Some RPC protocol
enum Proto {
    /// Some protocol state
    MsgLen(u32),
}

let rpc_handler = gen {
    let len = message.len();
    let next_state = yield Proto::MsgLen(len); // ← `yield` evaluates to a value
    ..
};
```

In order to support this, `Iterator::next` needs to be able to take an additional argument in the form of a new associated type `Args`. This associated type has the same name as the input arguments to `Fn` and `AsyncFn`. If "iterator with a next argument" can be thought of as representing a "coroutine", the `Fn` family of traits can be thought of as representing a regular "routine" (function).

为了支持这一点, 需要引入新的关联类型 `Args` 作为 `Iterator::next` 方法的参数. 此关联类型的名称与 `Fn` 和 `AsyncFn` 的参数相同. 如果可以将 "具有下一个参数的迭代器" 视为代表了 "coroutine", 则可以将 `Fn` trait 家族视为代表常规的 "routine" (函数).

```rust
pub trait IntoIterator {
    type Item;
    type Args;                                         // ← Args
    type IntoIter:
        Iterator<Item = Self::Item, Args = Self::Args>; // ← Args
    fn into_iter(self) -> Self::IntoIter;
}

pub trait Iterator {
    type Item;
    type Args;                                                 // ← Args
    fn next(&mut self, args: Self::Args) -> Option<Self::Item>; // ← Args
    fn size_hint(&self) -> (usize, Option<usize>) { .. }
}
```

Here too it's interesting to consider the caller side. Starting with a hypothetical `for_each` function: it would need to be able to take an initial value passed to next, and then from the closure be able to return additional values passed to subsequent invocations of next. The signature for that would look like this:

在这里, 考虑调用者方面也很有趣. 从假设的 `for_each` 函数开始: 它需要能够将初始值传递到 `next`, 然后从闭包中可以返回传递给 `next` 的后续调用的其他值. 签名看起来像这样:

```rust
fn for_each<F>(self, args: Self::Args, f: F) // ← Args
where
    Self: Sized,
    F: FnMut(Self::Item) -> Self::Args,      // ← Args
{ .. }
```

To better illustrate how this would work and build up some intuition, consider manual calls to `next` inside of a loop. We would start by constructing some initial state that is passed to the first invocation of `next`. This will produce an item that can be used to construct the next argument to `next`. And so on, until the iterator has no more items left to yield:

为了更好地说明工作原理并建立一些直觉, 假设我们将在循环内部手动调用 `next` 的例子, 我们将构建第一次调用 `next` 时传递的初始参数, 并处理 `next` 返回的 item 作为下一次调用 `next` 的参数. 依此类推, 直到迭代器没有更多的物品可以产生:

```rust
let mut iter = some_value.into_iter();
let mut arg = some_initial_value;

// loop as long as there are items to yield
while let Some(item) = iter.next(arg) {
    // use `item` and compute the next `arg`
    arg = process_item(item);
}
```

If we were to iterate over an iterator with a next function using a for..in expression, the equivalent of returning a value from a closure would be either to continue with a value. This could potentially also be the final expression in the loop body, which you can think of itself being an implied continue today. The only question remaining is how to pass initial values on loop construction, but that mainly seems like an exercise in syntax design:

如果我们要使用 `for...in` 表达式来遍历带有 `next` 方法的迭代器, 从闭包返回值的等价操作可能是通过 continue 携带值来实现. 这也可能成为循环体中的最终表达式, 你可以将其视为当前隐含的 continue 操作. 剩下的唯一问题是如何在循环构造时传递初始值, 但这似乎主要是语法设计的范畴:

```rust
// Passing a value to the `next` function seems like
// it would logically map to `continue`-expressions.
// (passing initial state to the loop intentionally omitted)
for item in iter {
    continue process_item(item);  // ← `continue` with value
};

// You can think of `for..in` expressions as having
// an implied `continue ()` at the end. Like functions
// have an implied `return ()`. What if that could take
// a value?
// (passing initial state to the loop intentionally omitted)
for item in iter {
    process_item(item)             // ← `continue` with value
};
```

"iterator with return value" and "iterator with next argument" feel like they map particularly well to break and continue. I think of them as duals, enabling both expressions to carry non-unit types. This feels like it might be an important insight that I haven't seen anyone bring up before.

感觉 "带有返回值的迭代器" 和 "带有下一个参数的迭代器" 相当能映射到 break 和 continue. 我认为它们是伴生的, 使两种表达式都可以携带非 Unit 类型. 这感觉可能是我以前从未见过的重要见解.

Being able to pass a value to next is one of the hallmark features of the [`Coroutine`](https://doc.rust-lang.org/nightly/std/ops/trait.Coroutine.html) trait in the stdlib. However unlike the trait sketch we provided here, in Coroutine the type of the value passed to next is defined as a generic param on the trait rather than an associated type. Presumably that is so that Coroutine can have multiple implementations on the same type that depend on the input type. I searched whether this was actually being used today, and it doesn't seem to be. Which is why I suspect it is likely fine to use an associated type for the input arguments.

能够向 `next` 方法传递值是标准库中 [`Coroutine`](https://doc.rust-lang.org/nightly/std/ops/trait.Coroutine.html) trait 的标志性特征之一. 但与本文提出的特性设计草案不同, 在标准库的 `Coroutine` 中, 传递给 `next` 方法的值的类型被定义为特性上的泛型参数 (generic param), 而非关联类型 (associated type). 推测这样设计是为了允许在同一个类型上根据输入类型的不同, 实现多个不同的协程变体. 但经过调研, 目前实际应用中似乎并没有这样的使用场景. 基于此, 我们有理由认为将输入参数的类型定义为关联类型是可行的方案.

## Short-Circuiting Iterator | 可短路迭代器

While it is possible to return `Try`-types such as `Result` and `Option` from an iterator today, it isn't yet possible is to immediately stop execution in the case of an error [^5]. This behavior is typically referred to as "short-circuiting": halting normal operation and triggering an exceptional state (like an electrical breaker would in a building).

虽然现在可以从迭代器中返回 `Try` 类型, 例如 `Result` 和 `Option`, 但在发生错误[^5]的情况下, 不可能立即停止执行. 这种行为通常称为 "短路": 停止正常操作并触发特殊状态(就像建筑物中的电气断路器一样).

In unstable Rust we have `try {}` blocks that rely on the unstable Try trait, but we don't yet have try fn functions. If we want these to function in traits the way we'd want them to, they will have to desugar to impl `Try`. Rather than speculate about what a potential try fn syntax might look like in the future, we'll be writing our samples using -> impl Try directly. Here is what the Try (and FromResidual) traits look like today:

在 unstable Rust 中, 我们有 `try {}` 块, 其依赖于尚未稳定的 `Try` trait, 但我们还没有 `try fn` 功能. 如果我们希望这些以我们希望它们的方式在 trait 上发挥作用, 则将不得不将其解糖为 `impl Try`. 我们将直接使用 `-> impl Try` 撰写例子, 而不是推测潜在的 `try fn` 语法可能是什么样的.

这是 `Try` (和 `FromResidual`) trait 现在的样子:

```rust
/// The `?` operator and `try {}` blocks.
pub trait Try: FromResidual {
    /// The type of the value produced by `?`
    /// when _not_ short-circuiting.
    type Output;
    
    /// The type of the value passed to `FromResidual::from_residual`
    /// as part of ? when short-circuiting.
    type Residual;
    
    /// Constructs the type from its `Output` type.
    fn from_output(output: Self::Output) -> Self;

    /// Used in ? to decide whether the operator should produce
    /// a value ( or propagate a value back to the caller.    
    fn branch(self) -> ControlFlow<Self::Residual, Self::Output>;
}

/// Used to specify which residuals can be converted
/// into which `Try` types.
pub trait FromResidual<R = <Self as Try>::Residual> {
    /// Constructs the type from a compatible `Residual` type.
    fn from_residual(residual: R) -> Self;
}
```

You can think of a short-circuiting iterator as a special case of an "iterator with return value". In its base form, it will only return early in case of an exception while its logical return type remains hard-coded to unit. The return type of fn `next` should be an `impl Try` returning an `Option`, with the value of `Residual` set to the associated `Residual` type. This allows all combinators to share the same `Residual`, enabling types to flow.

您可以将可短路迭代器视为 "带有返回值的迭代器" 的特殊情况: 只有在错误的情况下才能提早返回, 而其逻辑返回类型仍将硬编码为 Unit. `next` 的返回类型应当 `impl Try`, 实际返回 `Option`, 并设置关联类型为 `Residual`. 这允许组合器共享相同的 `Residual`:

```rust
pub trait IntoIterator {
    type Item;
    type Residual;
    type IntoIter: Iterator<
        Item = Self::Item,
        Residual = Residual   // ← Residual
    >;
    fn into_iter(self) -> Self::IntoIter;
}

pub trait Iterator {
    type Item;
    type Residual;                  // ← Residual
    fn next(&mut self) -> impl Try<  // ← impl Try
        Output = Option<Self::Item>,
        Residual = Self::Residual,   // ← Residual
    >;
}
```

If we once again consider the caller, we'll want to provide a way for for..in expressions to short-circuit. What's interesting here is that the base iterator trait already provides a `try_for_each`, method. The difference between that method and the `for_each` we're about to see is how the type of Residual is obtained. In `try_for_each` the value is local to the method, while if the trait itself is "short-circuiting" the type of `Residual` is determined by the associated `Self::Residual` type. Or put differently: in a short-circuiting iterator the type we short-circuit with is a property of the trait rather than a property of the method.

如果我们再次考虑调用者, 我们需要为 `for...in` 表达式提供一种短路机制. 这里有趣的是, 基础的 `Iterator` trait已经提供了 `try_for_each` 方法. 该方法与我们即将看到的 `for_each` 之间的区别在于 `Residual` 类型的获取方式:

- 在 `try_for_each` 中, 该值的类型是方法的局部变量
- 而当 trait 本身具有 "短路" 特性时, `Residual` 的类型由关联的 `Self::Residual` 类型决定

换句话说: 在短路迭代器中, 我们用于短路的类型是 trait 本身的属性, 而不是方法的属性. 这体现了迭代器 trait 设计中控制流抽象的层级差异——将短路类型提升为 trait的关联类型, 使得短路行为成为迭代器的固有特性而非临时方法参数.

```rust
fn for_each<F, R>(self, f: F) -> R                  // ← Return type
where
    Self: Sized,
    F: FnMut(Self::Item) -> R,                      // ← Return type
    R: Try<Output = (), Residual = Self::Residual>, // ← `impl Try`
{ .. }
```

As mentioned earlier on in this post: the interaction between "iterator with a return type" and "short-circuiting iterator" is an interesting one. Returning `Option<ControlFlow>` from fn next is able to encode three distinct states, but this combination of capabilities requires us to encode four states:

如本文中前面提到的那样: "带返回值的迭代器" 和 "短路迭代器" 之间的相互关系相当有趣. 从 `next` 返回 `Option<ControlFlow>` 可以编码三个不同的状态, 但是此时要求我们编码四个状态:

- **yield** a next item **产生** 下一个值
- **break** with a residual 带残值 **中止**
- **return** a final output **返回** 最终输出
- iterator done (idempotent) 迭代器完成 (幂等的)

The reason why we want to be able to encode a signature like this is because when writing gen fn functions it is entirely reasonable to want to have a return type, short-circuit on error using `?`, and also `yield` values. This works like regular functions today, but with the added capability to invoke yield. The naive way of encoding this would be to return an impl Try of `Option<ControlFlow<_>>` with distinct associated types for `Item`, `Output`, and `Residual`. This does however feel like it is starting to get a little out of hand, though perhaps a first-class `try fn` notation might provide some relief.

我们希望支持此类签名的原因在于, 当编写生成器时, 完全有理由需要同时满足以下三个需求:

1. 定义返回类型
2. 使用 `?` 操作符进行错误短路
3. 通过 `yield` 产生值

这与普通函数的工作方式类似, 但额外增加了调用 `yield` 的能力. 最直观的实现方式可能是返回一个 `impl Try<Option<ControlFlow<_>>>`, 并为`Item`、`Output`和`Residual` 分别定义不同的关联类型. 然而这种方式开始显得**过于复杂**, 或许引入原生支持的 `try fn` 语法能有效简化这种设计.

```rust
pub trait IntoIterator {
    type Item;
    type Output;                          // ← `Output` 
    type Residual;                        // ← `Residual` 
    type IntoIterator: Iter<
        Item = Self::Item,
        Residual = Self::Residual,         // ← `Residual` 
        Output = Self::Output,             // ← `Output` 
    >;
    fn into_iter(self) -> Self::IntoIter;
}

pub trait Iterator {
    type Item;
    type Output;                    // ← `Output`
    type Residual;                  // ← `Residual`
    fn next(&mut self) -> impl Try<  // ← `impl Try` 
        Output = Option<ControlFlow< // ← `ControlFlow
            Self::Output,            // ← `Output
            Self::Item,
        >>,
        Residual = Self::Residual,   // ← `Residual` 
    >;
}
```

## Address-Sensitive Iterator | 地址敏感的迭代器

Rust's generator transformation may create self-referential types. That is: types which have fields that borrow from other fields on the same type. We call these types "address-sensitive" because once the type has been constructed, its address in memory must remain stable. This comes up when writing gen {} blocks that have stack-allocated locals [^6] that are kept live across yield-expressions. What is or isn't a "stack-allocated local" can get a little complicated. But it's important to highlight that for example calling `IntoIterator::into_iter` on a type and re-yielding all items is something that just works ([playground](https://play.rust-lang.org/?version=nightly&mode=debug&edition=2024&gist=e004e82ac881d53793e2bd37523b813e)):

Rust 生成器可能会产生自引用的类型, 即具有借用自身其他字段的字段的类型, 我们称之地址敏感, 即一旦构造, 其内存地址必须保持稳定 (译者注: 不能 move 或者以任何形式譬如 `mem::swap` 替换为新值, 否则此时旧值仍持有对原字段内存位置的引用, 会导致安全问题). 当编写带有于堆分配的局部变量[^6]的 `gen {}` 块时, 会出现这种情况. 关于是或不是 "堆分配的局部变量" 的问题会有些复杂. 但是, 重要的是要强调, 例如, 在类型上调用 `IntoIterator::into_iter` 并 yield 其元素是可行的([playground](https://play.rust-lang.org/?version=nightly&mode=debug&edition=2024&gist=e004e82ac881d53793e2bd37523b813e)):

```rust
// This example works today
let iter = gen {
    let cat_iter = cats.into_iter();
    for cat in cat_iter {
        yield cat;
    }
};
```

And to give a sense of what for example does not work, here is one of the samples Tmandry (T-Lang) collected. This creates an intermediate borrow, which results in the error: "Borrow may still be in use when gen fn body yields" ([playground](https://play.rust-lang.org/?version=nightly&mode=debug&edition=2024&gist=e8f7b798740a96f21805a8b772e54256)):

什么情况下不可以呢? 这里有一示例. 这会产生一个中间借用, 这导致错误: "borrow may still be in use when `gen` fn body yields" ([playground](https://play.rust-lang.org/?version=nightly&mode=debug&edition=2024&gist=e8f7b798740a96f21805a8b772e54256)):

(译者注: 原文链接有错, 已自行更正了)

```rust
gen fn iter_set_rc<T: Clone>(xs: Rc<RefCell<HashSet<T>>>) -> T {
    for x in xs.borrow().iter() {
        yield x.clone();
    }
}
```

In order to enable examples like the last one to work, Rust needs to be able to express some form of "address-sensitive iterator". The obvious starting point would be to mint a new trait `PinnedIterator` which changes the self-type of next to take a `Pin<&mut Self>` rather than `&mut self`:

为了处理如示例所示的情况, Rust 需要能够表达某种形式的 "地址敏感迭代器". 显而易见的起点是引入一个新的 trait `PinnedIterator`, 让 `next` 方法接受 `Pin<&mut Self>` 而不是 `&mut self`:

```rust
trait IntoIterator {
    type Item;
    type IntoIter: Iterator<Item = Self::Item>;
    fn into_iter(self) -> Self::IntoIter;
}

trait Iterator {
    type Item;
    fn next(self: Pin<&mut Self>) -> Option<Self::Item>; // ← `Pin<&mut Self>`
    fn size_hint(&self) -> (usize, Option<usize>) { .. }
}
```

Enumerating all the problems of `Pin` is worth its own blog post. But still, it seems important enough to point out that this definition has what Rust for Linux calls `The Safe Pinned Initialization Problem`. `IntoIterator::into_iter` cannot return a type that is address-sensitive at time of construction, instead address-sensitivity is something that can only be guaranteed at a later point once the type is `pin!`ned in place.

细数 `Pin` 的各类问题是值得单开一篇新的博客文章的. 但是还是在此指出, Rust 中 `Pin` 的概念即 Linux 中的 `The Safe Pinned Initialization Problem`. `IntoIterator::into_iter` 无法返回构造时对地址敏感的类型, 确保地址不变是后面就地 `pin!` 的事情.

At the start of this post I used the phrase: "(soft-)deprecation of the Iterator trait". With that I was referring to one proposed idea to enable `gen {}` to return a new trait Generator with the same signature as our example. As well as some bridging impls for the purposes of compatibility. The core of the compat system would be as follows:

在这篇文章的开头, 我提到 "(软性)弃用 `Iterator` trait". 我的想法是, 使 `gen {}` 返回具有与我们的示例相同的签名的新 trait `Generator`, 以及某些兼容实现. 核心代码如下:

```rust
/// All `Iterator`s are `Generator`s
impl<I: IntoIterator> IntoGenerator for I {
    type Item = I::Item;
    type IntoGen = IteratorGenerator<I::IntoIter>;
    fn into_gen(self) -> Self::IntoGen {
        IteratorGenerator(self.into_iter())
    }
}

/// Only pinned `Generator`s are `Iterator`s
impl<G> Iterator for Pin<G>
where
    G: DerefMut,
    G::Target: Generator,
{
    type Item = <<G as Deref>::Target as Generator>::Item;
    fn next(&mut self) -> Option<Self::Item> {
        Generator::next(self.as_mut())
    }
}
```

This creates a situation that I've been describing as "one-and-a-half-way compat", as opposed to the usual two-way-compat. And we need two-way-compat to not be a breaking change. This leads to a situation where changing a bound from taking `Iterator` to `Generator` is backwards-compatible. But changing an impl from returning an `Iterator` to returning a `Generator` is not backwards-compatible. The obvious solution then would be to migrate the entire ecosystem to take Generator bounds everywhere. Coupled with gen {} only ever returning `Generator` and not Iterator: that is a deprecation of `Iterator` in all but name.

这种情况我称之为 "单向半兼容" (one-and-a-half-way compat), 区分于传统的双向兼容 (two-way-compat). 我们需要确保 **双向兼容性不会成为破坏性变更**. 这导致以下现象:

- 将约束从 `Iterator` 改为 `Generator` 是向下兼容的
- 但将实现从返回 `Iterator` 改为返回 `Generator` 则**不向下兼容**

最直接的解决方案是推动整个生态逐步迁移到全面采用 `Generator` 约束. 结合 `gen {}` 块始终返回 `Generator` 而非 `Iterator`, 这实质上构成了对 `Iterator` 的**变相弃用**, 尽管名义上仍保留其存在.

At first sight it might seem like we're being forced into deprecating `Iterator` because of the limitations of `Pin`. The obvious answer to that would be to solve the issues with `Pin` by replacing it with something better. But that creates a false dichotomy: there is nothing forcing us to make a decision on this today. As we established at the start of this section: a surprising amount of use cases already work without the need for address-sensitive iterators. And as we've seen throughout this post: address-sensitive iteration is far from the only feature that `gen {}` blocks will not be able to support on day one.

乍一看, 由于 `Pin` 的局限性, 我们似乎被迫弃用 `Iterator`. 显而易见的解决方案是直接踢掉 `Pin` 换成更好的方案. 但实际上, 没有什么迫使我们必须今天对此做出决定. 正如我们在本节开头所示: 令人惊讶的写法已经有效, 无需使用地址敏感的迭代器. 正如我们在这篇文章中看到的那样: 地址敏感的迭代远非 `gen {}` 块无法首先支持的唯一功能.

## Iterator Guaranteeing Destruct | 保证析构的迭代器

The current formulation of `thread::scope` requires that the thread it’s called on remains blocked until all threads have been joined. This requires stepping into a closure and executing all code within that. Contrast this with something like `FutureGroup` which logically owns computations and can be freely moved around. The values of the futures resolved within can in turn be yielded out. But unlike `thread::scope` it can’t guarantee that all computations will complete, and so a parallel version of `FutureGroup` can't mutably hold onto mutable borrows the way `thread::scope` can.

当前 `thread::scope` 的实现机制要求调用该方法的线程必须保持**阻塞状态**, 直到所有子线程完成. 这一特性要求必须进入闭包环境并执行其中的所有代码.

与之形成对比的是类似 `FutureGroup` 的结构:

- `FutureGroup`在**逻辑层面拥有计算任务**, 可以自由移动.
- 其内部解析完成的 `Future` 值可以 `yield` 产出.
- **无法保证所有计算任务都会完成**

因此, `FutureGroup` 的并行版本不能像 `thread::scope` 那样, 以可变方式持有可变借用. 这种根本性的差异源于两者不同的生命周期管理策略.

```rust
// A usage example of `thread::scope`,
// the ability to spawn new threads
// is only available inside the closure.
thread::scope(|s| {
    s.spawn(|| ..);
    s.spawn(|| ..);
                    // ← All threads are joined here.
});

// A usage example of `FutureGroup`,
// no closures required.
let mut group = FutureGroup::new();
group.insert(future::ready(2));
group.insert(future::ready(4));
group.for_each(|_| ()).await;
```

If we want to write a type similar to `FutureGroup` with the same guarantees as thread::scope, we'd either need to guarantee that `FutureGroup` can never be dropped or guarantee that `FutureGroup`'s `Drop` impl is always run. It turns out that it's rather impractical to have types that can't be dropped in a language where every function may panic. So the only real option here are to have types whose destructors are guaranteed to run.

如果我们要编写类似于 `FutureGroup` 的类型, 并具有与 `thread::scope` 相同的保证, 我们要么需要保证 `FutureGroup` 永远不会被 drop, 要么保证 `FutureGroup` 的`Drop` 实现永不返回. 但这是不切实际的. 我们唯一真正的选择是拥有保证必然被析构的类型.

The most plausible way we know of to do this would be by introducing a new auto trait Leak, disallowing types from being passed to mem::forget, Box::leak, and so on. For more on the design, read Linear Types One-Pager. Because Leak is an auto-trait, we could compose it with the existing Iterator and IntoIterator traits, similar to Send and Move:

我们知道这样做的最合理的方法是引入一个新的自动特征Leak, 将类型从传递给mem::forget, Box::leak等等. 有关设计的更多信息, 请读取线性类型的单选. 因为Leak是一种自动特征, 所以我们可以将其与现有的Iterator和IntoIterator特征组成, 类似于Send和Move:

fn linear_sink(iter: impl IntoIterator<IntoIter: ?Leak>) { .. }

## Async Iterator | 异步迭代器

In Rust the async keyword can transform imperative function bodies into state machines that can be manually advanced by calling the `Future::poll` method. Under the hood this is done using what is called a coroutine transform, which is the same transform we use to desugar `gen {}` blocks with. But that's just the mechanics of it; the async keyword in Rust also introduces two new capabilities: ad-hoc concurrency and ad-hoc cancellation. Together these capabilities can be combined to create new control-flow operations, like `Future::race` and `Future::timeout`.

在 Rust 中, `async` 关键字能够将命令式函数体转换为**可手动推进的状态机**, 这种推进通过调用 `Future::poll` 方法实现. 其底层实现依赖于**coroutine 转换**机制. 该机制同样用于 `gen {}` 代码块的脱糖处理. 但这仅仅是其实现机制, `async` 关键字引入了两项新能力: **临时并发**, 以及**临时取消**. 这些能力可组合使用, 创造新的控制流操作(如 `Future::race` 和 `Future::timeout`).

Async Functions in Traits were stabilized one year ago in Rust 1.75, enabling the use of async fn in traits. Making the Iteratortrait work with async is mostly a matter of adding an async prefix to next:

一年前, 在 Rust 1.75 中, AFIT 终于稳定 (关于 AFIT, 参见 [这里](../blog/25-02-08-pinning-down-future-is-not-send-errors.md) 的译者注), 从而允许在 `Iterator` trait 内引入异步方法:

```rust
trait IntoIterator {
    type Item;
    type IntoIter: Iterator<Item = Self::Item>;
    fn into_iter(self) -> Self::IntoIter;
}

trait Iterator {
    type Item;
    async fn next(&mut self) -> Option<Self::Item>;     // ← async
    fn size_hint(&self) -> (usize, Option<usize>) { .. }
}
```

While the `next` method here would be annotated with the `async` keyword, the `size_hint` method should probably not be. The reason for that is that it acts as a simple getter, and it really shouldn't be performing any asynchronous computation. It's also unclear whether `into_iter` should be an `async fn` or not. There is probably a pattern to be established here, and it might very well be.

`next` 方法将是 `async` 的, 但 `size_hint` 方法很可能不应该是, 它只是一个简单的 getter, 不应该执行任何异步计算. 目前尚不清楚 `into_iter` 是否应该是`async fn`. 这里可能有一个模式可以建立, 而且很可能是.

An combination of iterator variants that's been of some interest recently is an address-sensitive async iterator. We could imagine writing an address-sensitive async iterator by making next take self: Pin<&mut Self>:

最近, 地址敏感的异步迭代器引起了我们的兴趣. 我们可以想象通过使 `next` 接受 `self: Pin<&mut Self>` 来编写一个地址敏感的异步迭代器:

```rust
trait IntoIterator {
    type Item;
    type IntoIter: Iterator<Item = Self::Item>;
    async fn into_iter(self) -> Self::IntoIter;
}

trait Iterator {
    type Item;
    async fn next(self: Pin<&mut Self>) -> Option<Self::Item>; // ← async + `Pin<&mut Self>`
    fn size_hint(&self) -> (usize, Option<usize>) { .. }
}
```

This signature is likely to confuse some people. `async fn next` return an `impl Future` which itself must be pinned prior to being polled. In this example we are separately requiring that `Self` is also pinned. That is because "the state of the iterator" and "the state of the future" are not the same state. We intuitively understand this when working with non-async address-sensitive iterators: the locals created within the `next` are not captured by the enclosing iterator, and are free to be stack-pinned for the duration of the call to `next`. But when working with an asynchronous address-sensitive iterator, for some reason people seem to assume that all locals defined in fn `next` now need to be owned by the iterator and not the future.

(译者注: 此处原文非常晦涩, 意译.)

同步代码场景中我们知道, 方法内部创建的局部变量不是迭代器本身持有, 但在异步场景中, 人们却容易误认为 `async fn next` 中定义的所有局部变量由迭代器持有, 实际上一个道理. 这里额外使用 `Pin<&mut Self>` 只是为了确保可能的自引用有效.

In the async Rust ecosystem there exists a popular variation of an async iterator trait called [`Stream`](https://docs.rs/futures/latest/futures/stream/trait.Stream.html). Rather than keeping the state of the iterator (self) and the next function separate, it combines both into a single state. The trait has a single method `poll_next` which acts as a mix between `Future::poll` and `Iterator::next`. With a provided convenience function `async fn next` that is a thin wrapper around `poll_next`.

在异步 Rust 生态系统中, 存在一种称为 [`Stream`](https://docs.rs/futures/latest/futures/stream/trait.Stream.html) 的异步迭代器变体: 与其分别处理迭代器状态(self)和 `next` 方法, 不如将两个函数组合到单个状态中. 该 trait 提供 `poll_next` 方法, 充当 `Future::poll` 和 `Iterator::next` 的组合. 我们可以提供 `async fn next`, 对 `poll_next` 的简单封装.

```rust
trait IntoStream {
    type Item;
    type IntoStream: Stream<Item = Self::Item>;
    fn into_stream(self) -> Self::IntoStream;
}

pub trait Stream {
    type Item;
    fn poll_next(                            // ← `fn poll_next`
        self: Pin<&mut Self>,                // ← `Pin<&mut Self>`
        cx: &mut Context<'_>,                // ← `task::Context`
    ) -> Poll<Option<Self::Item>>;          // ← `task::Poll` 
    async fn next(&mut self) -> Self::Item   // ← `async`
    where
        Self: Unpin                          // ← `Self: Unpin` (译者注: 即对非自引用的 `Iterator`, 不是 pinned 也行)
    { .. }
    fn size_hint(&self) -> (usize, Option<usize>) { ... }
}
```

By combining both states into a single state, this trait violates one of the core tenets of async Rust's design: the ability to uniformly communicate cancellation by dropping futures. Here if the future by `fn next` is dropped, that is a no-op and cancellation will not occur. This causes compositional async control-flow operators like `Future::race` to not work despite compiling.

实际上结合这两个状态违反了异步 Rust 设计的一个核心原则: 允许通过丢弃 `impl Future` 的匿名结构体取消异步任务.
在这里, drop 掉 `fn next` 产生的 `impl Future`, 并不会取消 `Future`. 这会导致诸如 `Future::race` 之类的异步控制流操作尽管能通过编译, 但仍无法正常工作.

To instead cancel the current call to next you are forced to either drop the entire stream, or use some bespoke method to cancel just the future's state. Cancellation in async Rust is infamous for being hard to get right, which is understandable when (among other things) core traits in the ecosystem do not correctly handle it.

相反, 要取消当前对 `next` 的调用, 您将需要丢弃整个 `Stream`, 或使用一些定制方法来仅仅是取消 Future 的状态. 本来异步 Rust 中的取消操作就因难以正确进行而饱受诟病, 所以上面的现象还是可以理解的.

## Concurrent Iterator | 并发迭代器

As we're approaching the end of our exposition here, let's talk about the most elaborate variations on `Iterator`. First in line: the `rayon` crate and the `ParallelIterator` trait. `rayon` provides what are called "parallel iterators" which process items concurrently rather than sequentially, using operating system threads. This tends to significantly improve throughput compared to sequential processing, but have the caveat that all consumed items must implement `Send`. To see just how familiar parallel iterators can be: the following example looks almost identical to a sequential iterator except for the call to `into_par_iter` instead of `into_iter`.

博文最后, 让我们来看看迭代器最缜密的一个变体: `rayon` crate 的 `ParallelIterator` trait.
`rayon` 提供了所谓的 "并行迭代器", 它使用操作系统线程并发地而不是顺序地处理项目. 与顺序处理相比, 这往往会显着提高吞吐量, 但需要注意的是, 元素必须实现 `Send`. 其 API 和同步版本很像, 如以下示例, 看起来几乎与顺序迭代器相同, 除了调用 `into_par_iter` 而不是 `into_iter`:

```rust
use rayon::prelude::*;

(0..100)
    .into_par_iter()   // ← Instead of calling `into_iter`.
    .for_each(|x| println!("{:?}", x));
```

The `ParallelIterator` trait however comes as a pair with the `Consumer` trait. It can be a little mind-boggling but the way `rayon` works is that combinators can be chained to create a handler, which at the end of the chain is copied to each thread and used there to handle items. This is of course a simplified explanation; I'll defer to `rayon` maintainers to provide a detailed explanation. To give you a sense how different these traits are from the regular `Iterator` traits, here they are (simplified):

`ParallelIterator` trait 实际上和 `Consumer` trait 搭配. 它可能有点令人难以置信, 但 `rayon` 的工作方式是, 将组合器链接起来创建一个 handler, 在链的末尾将其复制到每个线程并用来处理项目. 当然, 这是一个简化的解释; 我将给出 `rayon` 维护者给出的详细解释. 为了让您理解其于常规 `Iterator` trait有多大的不同, 在这里给出(简化版本):

```rust
/// A consumer is effectively a generalized "fold" operation.
pub trait Consumer<Item>: Send + Sized {
    /// The type of folder that this consumer can be converted into.
    type Folder: Folder<Item, Result = Self::Result>;
    /// The type of reducer that is produced if this consumer is split.
    type Reducer: Reducer<Self::Result>;
    /// The type of result that this consumer will ultimately produce.
    type Result: Send;
}

/// A type that can be iterated over in parallel
pub trait IntoParallelIterator {
    /// What kind of iterator are we returning?
    type Iter: ParallelIterator<Item = Self::Item>;
    /// What type of item are we yielding?
    type Item: Send;
        /// Return a stateful parallel iterator.
    fn into_par_iter(self) -> Self::Iter;
}

/// Parallel version of the standard iterator trait.
pub trait ParallelIterator: Sized + Send {
    /// The type of item that this parallel iterator produces.
    type Item: Send;
    /// Internal method used to define the behavior of this
    /// parallel iterator. You should not need to call this
    /// directly.
    fn drive_unindexed<C>(self, consumer: C) -> C::Result
    where
        C: UnindexedConsumer<Self::Item>;
}
```

What matters most here is that using the `ParallelIterator` trait feels similar to a regular iterator. All you need to do is call `into_par_iter` instead of `into_iter` and you're off to the races. On the consuming side it seems like we should be able to author some variation of for..in to consume parallel iterators. Rather than speculate about syntax, we can look at the signature of `ParallelIterator::for_each` to see which guarantees this would need to make.

这里最重要的是, 使用 `ParallelIterator` 与常规迭代器相似. 您仅需调用 `into_par_iter` 而不是 `into_iter`.
在消费端, 似乎我们能够写 `for...in` 的一些变体来消耗并行迭代器.
为此我们可以先看看 `ParallelIterator::for_each` 的签名:

```rust
fn for_each<F>(self, f: F)
where
    F: Fn(Self::Item) + Sync + Send
{ .. }
```

We can observe three changes here from the base iterator trait:

我们可以在这里观察到相较于基础的 `Iterator` trait, 存在三个变动:

- `Self` no longer needs to be Sized.

  `Self` 不再需要 `Sized`.
- Somewhat predictably the closure `F` needs to be thread-safe.

  可以预见的是, 闭包 `F` 需要是线程安全的.
- The closure `F` needs to implement `Fn` rather than `FnMut` to prevent data races.

  闭包 `F` 需要实现 `Fn` 而不是 `FnMut` 以防止数据竞争.

We can then infer that in the case of a parallel for..in expression, the loop body would not be able to close over any mutable references. This is an addition to the existing limitation that loop bodies already can't express `FnOnce` semantics and move values (e.g. "Warning: this value was moved in a previous iteration of the loop".)

我们可以推断出在并行 `for...in` 的情况下, 循环体将无法闭包可变借用. 这是现有限制的补充: 循环体已经无法表达 `FnOnce` 语义和移动值(例如 "警告: 此值在循环的先前迭代中被移动").

An interesting combination of are "parallel iteration" and "async iteration". An interesting aspect of the async keyword in Rust is that it allows for ad-hoc concurrent execution of futures without needing to rely on special syscalls or OS threads. This means that concurrency and parallelism can be detached from one another. While we haven't yet seen a "parallel async iterator" trait in the ecosystem, the futures-concurrency crate does encode a "concurrent async iterator"[^7]. Just like `ParallelIterator`, `ConcurrentAsyncIterator` comes in a pair with a `Consumer` trait.

一个有趣的组合是 "并行迭代" 和 "异步迭代". Rust 中 `async` 关键字的一个有趣之处在于, 它允许对 future 进行临时的并发执行, 而无需依赖特殊的系统调用或操作系统线程. 这意味着并发性和并行性可以彼此分离. 虽然我们还没有在生态系统中看到 "并行异步迭代器"  trait, 但 `futures-concurrency` crate 确实编码了一个 "并发异步迭代器" [^7]. 就像 `ParallelIterator` 一样, `ConcurrentAsyncIterator` 也与一个 `Consumer` trait 配对.

```rust
/// Describes a type which can receive data.
pub trait Consumer<Item, Fut>
where
    Fut: Future<Output = Item>,
{
    /// What is the type of the item we’re returning when completed?
    type Output;
    /// Send an item down to the next step in the processing queue.
    async fn send(self: Pin<&mut Self>, fut: Fut) -> ConsumerState;
    /// Make progress on the consumer while doing something else.
    async fn progress(self: Pin<&mut Self>) -> ConsumerState;
    /// We have no more data left to send to the `Consumer`;
    /// wait for its output.
    async fn flush(self: Pin<&mut Self>) -> Self::Output;
}

pub trait IntoConcurrentAsyncIterator {
    type Item;
    type IntoConcurrentAsyncIter: ConcurrentAsyncIterator<Item = Self::Item>;
    fn into_co_iter(self) -> Self::IntoConcurrentAsyncIter;
}

pub trait ConcurrentAsyncIterator {
    type Item;
    type Future: Future<Output = Self::Item>;

    /// Internal method used to define the behavior
    /// of this concurrent iterator. You should not
    /// need to call this directly.
    async fn drive<C>(self, consumer: C) -> C::Output
    where
        C: Consumer<Self::Item, Self::Future>;
}
```

While `ParallelIterator` and `ConcurrentAsyncIterator` have similarities in both usage and design, they are different enough that we cant quite think as one being the async, non-thread-safe version of the other. Perhaps it is possible to bring both traits closer to one another, so that the only difference are a few strategically placed async keywords, but more research is needed to validate whether that is possible.

尽管 `ParallelIterator` 和 `ConcurrentAsyncIterator` 在用法和设计上都有相似之处, 但它们的不同之处在于我们不能完全认为一个是异步的, 非线程安全版本的另一个版本. 也许可以使这两个 trait 彼此接近, 使其唯一的区别是一些 `async` 关键字, 但是需要更多的研究来验证是否可能.

Another interesting bit to point out here: concurrent iteration is also mutually exclusive with lending iteration. A lending iterator relies on yielded items having sequential lifetimes, while concurrent iterators rely on yielded items having overlapping lifetimes. Those are fundamentally incompatible concepts.

这里还要指出另一个有趣的细节: 并发迭代与借用迭代也是互斥的. 借用迭代依赖于产生的元素具有连续的生命周期, 而并发迭代依赖于产生的元素具有重叠的生命周期. 这些概念从根本上是不相容的.

## Conclusion | 结论

And that's every iterator variant that I know of, bringing us to 17 different variations. If we take away the variants that we can express using subtraits (4 variants) and auto-traits (5 variants), we are left with 9 different variants. That's 9 variants, with 76 methods, and approximately 150 trait impls in the stdlib. That is a big API surface, and that's not even considering all the different combinations of iterators.

我所知道的迭代器变体就这么多了, 总共有 17 种不同的变体. 如果我们去掉可以用子 trait (4 个) 和 auto-trait (5 个) 表示的变体, 那么还剩下 9 个不同的变体. 9 个变体, 76 个方法, 以及标准库中大约 150 个 trait 实现: 相当多的 API, 还没考虑各种变体的组合器.

`Iterator` is probably the single-most complex trait in the language. It is a junction in the language where every effect, auto-trait, and lifetime feature ends up intersecting. And unlike similar junctions like the Fn-family of traits; the Iterator trait is stable, broadly used, and has a lot of combinators. Meaning it both has a broad scope, and stringent backwards-compatibility guarantees we need to maintain.

`Iterator` 可能是该语言中最复杂的 trait. 它是语言中的一个交汇点, 每个效应、auto-trait 和生命周期特性最终都会在这里相交. 与 `Fn` 系列 trait 不同, `Iterator` trait 早已稳定而被广泛使用, 并且还有很多组合器, 这就给维护向下兼容性带来相当大麻烦.

At the same time Iterator is also not that special either. It's a pretty easy trait to write by hand after all. The way I think of it is mainly as a canary for language-wide shortcomings. Iterator is for example not unique in its requirement for stable addresses: we want to be able to guarantee this for arbitrary types and to be able to use this with arbitrary interfaces. I believe that the question to ask here should be: what is stopping us from using address-sensitive types with arbitrary types and arbitrary interfaces? If we can answer that, not only will we have an answer for `Iterator` - we will have solved it for all other interfaces we did not consciously anticipate would want to interact with this [^8].

当然, `Iterator` 也不是那么特别. 毕竟, 手动编写一个 `Iterator` trait 是相当容易的.
我认为它主要是一个用于检测语言范围缺陷的金丝雀. 例如, 并不只有 `Iterator` 需要稳定地址的概念: 我们希望能够保证任意类型的稳定地址, 并且能够将其与任意接口一起使用. 我认为这里应该问的问题是: 是什么阻止我们将地址敏感类型与任意类型和任意接口一起使用？ 如果我们能够回答这个问题, 不仅能解决 `Iterator` 的问题, 还能解决我们没有有意识地预料到会与之交互的所有其他接口[^8].

In this post I've done my best to show by-example which limitations the Iterator trait has today, and how each variant can overcome those. And while I believe that we should try and lift those limitations over time, I don't think anyone is too keen on us minting 9 new variations on the core::iter submodule. Nor the thousand-plus possible combinations of those submodules (yay combinatorics). The only feasible approach I see to navigating the problem space is by extending, rather than replacing, the Iterator trait. Here is my current thinking for how we might be able to extend Iterator to support all iterator variants:

在这篇文章中, 我尽力通过示例展示了 `Iterator` trait 还有哪些限制, 以及每个变体是如何克服这些限制的.
虽然我认为我们应该努力逐步解决这些限制, 但我认为没有人热衷于在 `core::iter` 子模块上再引入 9 个新的变体. 也没有人热衷于这些子模块的数千种可能的组合(组合学万岁). 我认为解决这个问题的唯一可行方法是扩展 `Iterator` trait, 而不是替换它. 这是我目前关于如何扩展 `Iterator` 以支持所有迭代器变体的想法:

- base trait: default, already supported

  基本 trait: 默认, 已经支持
- dyn-compatible: default, already supported

  dyn 兼容: 默认, 已经支持
- bounded: sub-trait, already supported

  有界: 子 trait, 已经支持
- fused: sub-trait, already supported

  fused: 子 trait, 已经支持
- thread-safe: auto-trait, already supported

  线程安全: auto trait, 已经支持
- seeking: sub-trait

  定位 :子 trait
- compile-time: effect polymorphism (const) [^9]

  编译时操作: 效应多态 (const) [^9]
- lending: `'move` lifetime [^10]

  借用: `'move` 生命周期 [^10]
- with `return` value: unsure [^11]

  带返回值: 不确定 [^11]
- with `next` argument: default value + optional/variadic arg

  `next` 方法接受参数: 默认 + 可选 / 可变参数
- short-circuiting: effect polymorphism (try)

  短路: 效应多态 (try)
- address-sensitive: auto-trait

  地址敏感: auto trait
- guaranteeing destruct: auto-trait

  保证析构: auto trait
- async: effect polymorphism (async)

  异步: 效应多态 (async)
- concurrent: new trait variant(s)

  并发: 新的 trait 变体

译者注: *效应多态* 并不是 *effect polymorphism* 的推荐译法, 译者查询资料并没有发现其准确译名. 所谓 "效应多态", 大意是指一定的函数或代码块能够以多态的方式适应不同的效应需求, 如异步执行、异常处理、状态变更等, 无需绑定到具体实现. 例如所谓 "Replace Conditional with Polymorphism".

When evolving the language, I believe we entire job is to balance feature development with the management of complexity. If done right, over time the language should not only become more capable, but also simpler and easier to extend. To quote something TC (T-Lang) said in a recent conversation: "We should get better at getting better every year". [^12]

在语言演进的过程中, 我认为我们全部的工作就是平衡特性开发和复杂性管理. 如果做得好, 随着时间的推移, 语言不仅应该变得更强大, 而且应该更简单、更容易扩展. 引用TC（T-Lang）最近一次对话中的话: "我们应该每年都变得更擅长变得更好".[^12]

As we think about how we wish to overcome the challenges presented by this post, it is my sincere hope that we will increasingly start thinking of ways to solve classes of problems that just happen to show up with Iterator first. While at the same time looking for opportunities to ship features sooner, without blocking ourselves on supporting all of the use cases straight away.

当我们思考如何克服这篇文章提出的挑战时, 我真诚地希望我们能越来越多地开始思考如何解决一类问题, 而这类问题恰好首先出现在 `Iterator` 中. 同时, 寻找机会更快地发布特性, 而无需一开始就阻塞自己, 去支持所有的用例.

[^1]: I'm basing this off of my experience being a part of the Node.js Streams WG through the mid-2010s. By my count Node.js now features five distinct generations of stream abstractions. Unsurprisingly it's not particularly pleasant to use, and ideally something we should avoid replicating in Rust. Though I'm not opposed to running deprecations of core traits in Rust either, I believe that in order to do that we want to be approaching 100% certainty that it'll be the last deprecation we do. If we're going to embark on a decade plus of migration issues, we have to make absolutely sure it's worth it.\
我是根据我在 2010 中期参与 Node.js Streams WG 的经验来判断的. 据我统计, Node.js 现在有五个不同的流抽象. 不出所料, 它用起来不是特别愉快, 理想情况下我们应该避免在 Rust 中复制这种灾难. 虽然我也不反对在 Rust 中促成核心 trait 的弃用, 但我希望接近 100% 确定这将是我们做的最后一次弃用. 如果我们要开始长达十多年的迁移问题, 我们必须绝对确定这是值得的.

[^2]: Admittedly my knowledge of dyn is spotty at best. Out of everything in this post, the section on dyn was the bit I had the least intuition about.\
诚然, 我对 `dyn` 的了解充其量也只是略知皮毛. 在这篇文章的所有内容中, 关于 `dyn` 的部分是我最没有直觉的部分.

[^3]: No, files in `/proc` are not "regular files". Yes, I know sockets are technically file descriptors.\
不, `/proc` 中的文件不是 "常规文件". 是的, 我知道套接字在技术上是文件描述符.

[^4]: Remember that strings are heap-allocated so we don’t need to account for address-sensitivity. While the compiler can't yet perform this desugaring, there is nothing in the language prohibiting it.\
请记住, 字符串是在堆上分配的, 所以我们不需要考虑地址敏感性. 虽然编译器还不能执行这种脱糖操作, 但语言中没有任何东西阻止那么干.

[^5]: By that I mean: an error, not a panic.\
我的意思是：一个错误, 而不是一个 panic.

[^6]: This affects heap-allocated locals too, but that's not a limitation of the language, only one of the impl.\
这也会影响堆分配的局部变量, 但这并不是语言的限制, 只是实现上的限制.

[^7]: Technically this trait is called `ConcurrentStream`, but there is little that is `Stream`-dependent here. I called it that because it is compatible with the `futures_core::Stream` trait since `futures-concurrency` is intended to be a production crate.\
从技术上讲, 这个 trait 叫做 `ConcurrentStream`, 但这里几乎没有依赖 `Stream` 的东西. 我这样称呼它是因为它与 `futures_core::Stream` trait 兼容, 因为 `futures-concurrency` 旨在成为一个可用于生产环境的 crate.

[^8]: This is adjacent to "known unknowns" vs "unknown unknowns" - we should not just cater to cases we can anticipate, but also to cases we cannot. And that requires analyzing patterns and thinking in systems.\
这与 "已知的未知" 与 "未知的未知" 相邻 - 我们不应该只迎合我们可以预料到的情况, 还应该迎合我们无法预料到的情况. 这需要分析模式并以系统的方式思考.

[^9]: the `const` effect itself is already polymorphic over the compile-time effect, since const fn means: "a function that can be executed either at comptime or runtime". Out of all the effect variants, `const` is most likely to happen in the near-term.\
`const` 效应本身已经是编译时效应的多态, 因为 `const fn` 意味着 "一个可以在编译时或运行时执行的函数". 在所有效应变体中, `const` 最有可能在短期内发生.

[^10]: What we want to express is that we have an associated type which MAY take a lifetime, not MUST take a lifetime. That way we can pass a type by value where a type would otherwise be expected to be passed by-reference. This is different from both 'static lifetimes and &own references.\
我们想要表达的是, 我们有一个关联类型, 它可以*可能*接受一个生命周期, 而不是*必须*接受一个生命周期. 这样, 我们可以通过值传递一个类型, 而在其他情况下, 该类型应该通过引用传递. 这与 `'static` 生命周期和 `&own` 引用都不同.

[^11]: I tried answering how to add return values to the Iterator trait a year ago in my post *Iterator as an Alias*, but I came up short. As I mentioned earlier in the post: combining "return with value" and "may short-circuit with error" seems tricky. Maybe there is a combination here I'm missing / we can special-case something. But I haven't seen it yet.\
一年前, 我试图在我的帖子 *Iterator as an Alias* 中回答如何向 `Iterator` trait 添加返回值, 但我没有成功. 正如我在帖子前面提到的：结合 "返回值" 和 "可能因错误而短路" 似乎很棘手. 也许这里我遗漏了一种组合/我们可以特殊处理一些事情. 但我还没有看到它.

[^12]: I recently remarked to TC that I've started to think about governance and language evolution as being about the derivative of the language and project. Rather than measuring the direct outcomes, we measure the process that produces those outcomes. TC remarked that what we should really care about is the double derivative. Not only should we improve our outcomes over time; the processes that produce those outcomes should improve over time as well. Or put differently: we should get better at getting better every year! I love this quote and I wanted y'all to read it too.\
我最近向 TC 评论说, 我已经开始将治理和语言演进视为语言和项目的导数. 我们不是衡量直接结果, 而是衡量产生这些结果的过程. TC 评论说, 我们真正应该关心的是二阶导数. 不仅我们应该随着时间的推移改善我们的结果；产生这些结果的过程也应该随着时间的推移而改善. 或者换句话说：我们应该每年都变得更擅长变得更好! 我喜欢这句话, 我想让你们也读一读.
