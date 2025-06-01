<!-- ---
author: Barrett Ray, translated by Hantong Chen
title: "Rust 2024: 总结与展望"
pubDatetime: 2024-12-21T00:00:00.000+00:00
modDatetime: 2024-12-30T00:20:00.000+08:00
featured: true
draft: false
tags:
  - rust
  - translation
  - twir
description: "回顾今年 Rust 取得的进步, 展望未来"
--- -->

> `This Week in Rust (TWiR)` Rust 语言周刊中文翻译计划, 第 579 期
>
> 本文翻译自 Barrett Ray 的博客文章 [https://barretts.club/posts/rust_review_2024/](https://barretts.club/posts/rust_review_2024/), 已获许可, 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](../glossary/rust-glossary.md).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2024 年 12 月 30 日凌晨, 于北京.

![GitHub last commit](https://img.shields.io/github/last-commit/han-rs/twir.han.rs?path=src%2F579%2Frust-review-2024.md&style=social&label=Last%20updated)

# A Review of Rust in 2024: What Next?

Rust 2024: 总结与展望

Rust is a programming language with a highly active community. Contributors are constantly adding new features and working toward new goals. This article summarizes my favorite features added in 2024, and also addresses my hopes for the future!

Rust 是一门有着高度活跃的社区的编程语言, 无数贡献者正持续为其添加新功能、达成新目标. 本文总结了 2024 年添加到 Rust 的我最喜欢的语言特性, 同时也展望了我未来的期许.

If you're here to see me complain about what we don't have yet, please head to the `Wishlist for 2025` section.

如果您只是想听听我对 Rust 尚未有的特性的 "抱怨", 请移步 `Wishlist for 2025`.

## Table of contents

## Review of 2024 | 2024 年度回顾

The Rust project has made countless improvements to the language this year. Let's review and see what might come next!

Rust 项目今年对该语言有无数改进. 首先让我们回顾一下.

### [`&raw` Reference Syntax | `&raw` 原始引用语法](https://blog.rust-lang.org/2024/10/17/Rust-1.82.0.html#native-syntax-for-creating-a-raw-pointer)

We now support creating `&raw const` and `&raw mut` references as distinct types. These let you safely refer to fields without a well-defined alignment, much like the long-time workarounds (`addr_of!` and `addr_of_mut!` macros) did:

我们现在支持将 `&raw const` 和 `&raw mut` 引用创建为不同的类型. 这些可以让您安全地引用没有明确定义对齐的字段, 就像以往的解决方法(`addr_of!` 和 `addr_of_mut!` 宏)所做的那样:

(译者注: 详见 [https://blog.rust-lang.org/2024/10/17/Rust-1.82.0.html](https://blog.rust-lang.org/2024/10/17/Rust-1.82.0.html))

```rust
/// These fields will be "packed", so there won't be extra padding.
/// 
/// 这些字段将是 "packed" 的, 没有额外的填充.
///
/// This can reduce memory usage, but screws with everything else. It's
/// sometimes used in low-level contexts.
///
/// 这种做法有助于减少内存占用, 但在其他方面都不尽人意, (仅)有时应用于底层代码.
///
/// See: https://doc.rust-lang.org/nomicon/other-reprs.html#reprpacked
#[repr(packed)]
struct MyPackedStruct {
    field_a: i32,
    field_b: i8,
    field_c: u16,
}

let mps: MyPackedStruct = MyPackedStruct {
    field_a: 582,
    field_b: -4,
    field_c: 989,
};

// scary: this will probably cause undefined behavior (UB)!
//
// 可怕: 这可能导致未定义行为(undefined behavior, UB)!
//
// the compiler now gives you an error here.
//
// 编译器会在这里报告错误.
let bad: *const i32 = &mps.field_a as *const i32;

// happy: no problems here.
//
// 高兴: 这里没问题
let good: *const i32 = &raw const mps.field_a;

// we'll want to read the value out using this method.
//
// 我们将使用此方法读取其值.
//
// note: it's only unsafe because `read_unaligned` doesn't care if the
// type is `Copy`. so you can do some nonsense with it
// ...kinda like `core::mem::replace`
//
// 注意: 这里之所以 unsafe, 是因为 `read_unaligned` 不关心类型是否实现 `Copy`, 所以您能做一些
// 没什么实际意义的事情, 例如 `core::mem::replace`.
//
// (译者注: 参见 https://doc.rust-lang.org/std/ptr/index.html#safety)
let value: i32 = unsafe { good.read_unaligned() }; // this is how you'd read the value
```

Again, though, avoid `Packed` representations if you can. They're a bit of a footgun. If you do need to use them, though, `&raw` is vital!

再一次指出, 应尽量避免 `Packed`. 它们有点像七伤拳(译者注: `footgun`, 伤自己的脚的枪). 但是, 如果您确实需要使用它们, 那么 `&raw` 就至关重要!

At first, their usage might seem unclear. What is the difference if the syntax just spits out a `*const` or `*mut`... just like `as` casting would? In short, Rust usually requires you to **first** create a reference (`&MyType`) before you can cast to a raw pointer (`*const MyType` and `*mut MyType`).

它们(原始引用)的用法可能看起来不甚明了. 如果只是个简单获得 `*const` 或 `*mut`... 的语法, 就像 `as` 转换一样, 那有什么区别? 简而言之, Rust 通常要求您首先创建一个引用 (`&MyType`), 然后才能转换为原始指针(`*const MyType` 和 `*mut MyType`).

However, Rust's references have certain guarantees that raw references don't have. In particular, they must be both **aligned** and **dereferenceable**.[^1] When these aren't true, you immediately create opportunities for undefined behavior (UB) by even compiling the thing. Miscompilations are likely due to LLVM's reliance on those two invariants.

然而, Rust 意义下的引用具有原始引用所没有的某些保证(invariant), 特别是, 它们必须既**对齐**又**可被取消引用**[^1]. 如果这些保证不成立, 虽然可以通过编译, 但可能存在未定义行为(UB). 错误的编译结果可能是由于 LLVM 默认已满足这两个保证.

Raw reference (`&raw`) syntax addresses these problems by telling LLVM that those invariants might not be true. Certain optimizations (and other reliant invariants) are now turned off or adjusted.

原始引用(`&raw`)语法通过告诉 LLVM 这些保证可能不满足来解决这些问题. 某些优化(以及其他一些相关的保证)将被关闭或调整.

### [Floating-Point Types in `const fn` | `const fn` 中的浮点类型](https://github.com/rust-lang/rust/pull/128596)

In the past, you may have tried to use floating-point (FP) numbers within `const` functions. However, before Rust 1.82, the compiler would stop you. This limitation stemmed from platform differences in FP numbers.

过去, 您可能尝试过在 `const` 函数中使用浮点(FP)数. 然而, 在 Rust 1.82 之前, 编译器会阻止您. 这种限制源于浮点数的平台差异.

To understand why, you need to know a bit of context. In Rust, `const` refers to more than something that won't change - it's a block that can be computed at compile-time! This system spares many runtime operations, making programs faster. However, since FP numbers have platform differences, it's harder to compute that stuff at compile-time. If you do, your program's behavior will change depending on what machine compiled it, even if the cross-compilation is expected to be deterministic!

要理解原因, 您需要了解一些背景知识. 在 Rust 中, `const` 不仅仅指的是不会改变的东西——它是一个可以在编译时计算的块! 这节省了许多运行时开销, 使程序更快. 然而, 由于浮点数存在平台差异, 因此在编译时计算这些内容会更加困难, 如果那么干, 程序的行为将根据编译它的机器而改变, 但是如交叉编译, 其结果应当是不受编译机器条件变化而改变的!

There's also another problem. If you want to avoid those cross-compilation flaws, you have to write rules for floats to follow at compile-time. **They should be very close to runtime behavior**, and ideally, exactly the same. Notably, [Go fell into this trap](https://rtfeldman.com/0.1-plus-0.2#compile-time-vs-runtime), causing major differences in behavior depending on when floats are evaluated. Every time you use floats in Go, you have to ensure all your code agrees.

还有另一个问题. 如果您想避免这些交叉编译中可能出现的问题, 就必须指出要在编译时遵循的浮点数规则, 它们应该非常接近运行时行为, 并且理想情况下应当完全相同. 值得注意的是, [Go 陷入了这个陷阱](https://rtfeldman.com/0.1-plus-0.2#compile-time-vs-runtime), 导致行为发生重大差异, 具体取决于浮点数计算是编译时抑或运行时. 每次在 Go 中使用浮点数时, 都必须确保所有代码都一致(译者注: 即要么都 `0.1 + 0.2 == 0.3`, 要么都 `a := 0.1`, `b := 0.2` 后 `a + b`, 前者使用常量, 编译时计算使用精确算法, 后者使用变量, 运行时计算, 结果损失精度为 `0.30000000000000004`. 参见博文.).

With these requirements in mind, and a lot of hard work, Rust has introduced floats in `const fn`! It uses many custom rules to specify exactly how they should work. These are given in [RFC 3514: Float Semantics](https://github.com/rust-lang/rfcs/blob/master/text/3514-float-semantics.md), which specifies how floating-point numbers should work in the language.

考虑到这些要求, 并经过大量的努力, Rust 在 `const fn` 中引入了浮点数! 它使用许多自定义规则来准确指定它们应该如何工作. [RFC 3514: 浮点语义](https://github.com/rust-lang/rfcs/blob/master/text/3514-float-semantics.md) 中给出了这些内容, 它指定了浮点数在该语言中的工作方式.

```rust
struct Maybe {
    pub float: f32,
}

/// As you can see, we're allowed to use floats in `const`!
///
/// 如您所见, 我们现在允许在 `const` 中使用浮点数!
const fn float_in_const(call_me: &Maybe) -> (bool, f32) {
    let f: f32 = call_me.float; // also in your data structures :)

    let new = f / 1.1;
    (new.is_finite(), new)
}
```

Note that most methods on the `f32`/`f64` primitives don't yet use this. For example, `f32::powf` and `f32::powi` aren't yet `const`. Using [`#![feature(const_float_methods)]`](https://github.com/rust-lang/rust/issues/130843) on Nightly can get you some of the way there, though these power functions don't seem to be included yet.

请注意, `f32`/`f64` 基本类型上的大多数方法尚未(在 stable 版本中)提供 `const`, 例如 `f32::powf` 和 `f32::powi`. 在 Nightly 上使用 [`#![feature(const_float_methods)]`](https://github.com/rust-lang/rust/issues/130843) 可启用将部分方法标识为 `const`, 虽然例如前面那两个强大的方法似乎尚未包含在内.

### [`#[expect(lint)]`](https://blog.rust-lang.org/2024/09/05/Rust-1.81.0.html#expectlint)

These attributes are just like `#[allow(lint)]`, but they also give an error when the "expectation" isn't satisfied.

类似 `#[allow(lint)]`, 但当不满足 "期望"(expectation) 时也会给出错误.

For example, if you put `#[allow(unused)]` onto a function, but later start calling it somewhere, you typically wouldn't notice the change. You may forget the function is used in your API. The `#[expect]` attribute doesn't let this happen - it'll show an error if you violate its expectation.

例如, 如果您标识一个未使用的函数 `#[allow(unused)]`, 但后来开始在某个地方调用它. 您通常不会注意到这种变化, 您可能会忘记您的 API 中使用了该函数, 使用 `#[expect]` 就不会让这种情况发生: 如果您违反了 "期望", 它就会明确给出错误.

```rust
// you can just replace `#[allow(lint)]` with `#[expect(lint)]`
//
// 您可以简单地将 `#[allow(lint)]` 换成 `#[expect(lint)]`
//
// #[allow(unused)]
#[expect(unused)]
type SomeUnusedItem = i32;
```

This has already fixed some bugs in my code, so I wholeheartedly suggest giving it a try!

这已经修复了我的代码中的一些错误, 所以我衷心建议尝试一下!

(译者注: 搜了一下, 如 [https://github.com/onkoe/liboptic/blob/c3a4ea057315797cc9518d652533434fb00a6aae/edid/src/structures/desc/display_range_limits.rs#L154](https://github.com/onkoe/liboptic/blob/c3a4ea057315797cc9518d652533434fb00a6aae/edid/src/structures/desc/display_range_limits.rs#L154))

### [`core::error::Error` Trait Stabilization (`error` in `core`) | `core::error::Error` 特质已稳定 (`error` in `core`)](https://doc.rust-lang.org/stable/core/error/trait.Error.html)

If you've been in the embedded trenches before 1.81, you've seen [Issue #103765: Tracking Issue for `Error` in `core`](https://github.com/rust-lang/rust/issues/103765).

如果您在 Rust 1.81 之前涉足过嵌入式领域, 那么您已经看到过 [Issue #103765: Tracking Issue for `Error` in `core`](https://github.com/rust-lang/rust/issues/103765)

Everyone and their mother was using the (now defunct) `#![feature(error_in_core)]` attribute on their crate - and they all had to use Nightly to boot.

为此, 每个人和上游都不得不在他们的 crate 里使用 `#![feature(error_in_core)]` 属性(现已不复存在): 这需要 Nightly Rust.

This is no longer a problem! [`anyhow`](https://github.com/dtolnay/anyhow?tab=readme-ov-file#no-std-support), [`thiserror`](https://github.com/dtolnay/thiserror/issues/318), and my rip-off crate, [`pisserror`](https://github.com/onkoe/pisserror) all support embedded usage of `Error` now, at least through `no_std`! Note that `anyhow` still requires some form of allocator.

自此以后, 这不再是问题! [`anyhow`](https://github.com/dtolnay/anyhow?tab=readme-ov-file#no-std-support), [`thiserror`](https://github.com/dtolnay/thiserror/issues/318), 以及我的 "盗版" crate, [`pisserror`](https://github.com/onkoe/pisserror), 都已经支持嵌入式领域在 `no_std` 下使用 `Error` 特质! 请注意, `anyhow` 仍然需要某种形式的分配器(allocator).

Anyways... I feel like framing this link on my wall. <https://doc.rust-lang.org/stable/core/error/index.html>

不管怎样... 我想把这个链接挂在这 <https://doc.rust-lang.org/stable/core/error/index.html>.

### [`LazyCell`](https://doc.rust-lang.org/core/cell/struct.LazyCell.html) and [`LazyLock`](https://doc.rust-lang.org/std/sync/struct.LazyLock.html)

These two types are upstreamed from the well-known [`once_cell` crate](https://crates.io/crates/once_cell), but the standard library is finally catching up!

这两种类型来自著名的 `once_cell` crate , 标准库终于迎头赶上了!

[`LazyCell`](https://doc.rust-lang.org/core/cell/struct.LazyCell.html) is the standard library's version of the `once_cell::unsync::Lazy` type. It can't be used across threads or in statics, but it's made for something else: initializing a variable only when it's needed! They're typically used when you need to run a large computation once, then use the cached results.

[`LazyCell`](https://doc.rust-lang.org/core/cell/struct.LazyCell.html) 是 `once_cell::unsync::Lazy` 类型的标准库版本. 它不能跨线程或在静态中使用, 但它是为其他目的而设计的: 仅在需要时初始化变量! 当您需要运行一次大型计算, 然后使用缓存的结果时, 通常会使用它们.

In comparison to [`OnceCell`](https://doc.rust-lang.org/core/cell/struct.OnceCell.html), `LazyCell` is used when the computation is always the same. You can only specify the "creation function" in the constructor.

与 [`OnceCell`](https://doc.rust-lang.org/core/cell/struct.OnceCell.html) 相比, 当计算结果始终相同时使用 `LazyCell`. 您只能在构造函数中指定 "创建函数".

```rust
/// A huge type that we need for our app!
///
/// 我们的 APP 需要的一个巨大的类型!
struct BigType {
    creation_time: Instant,
    // lots of other fields...
    // 许多别的字段
}

impl BigType {
    /// pretend this takes forever. we'll use `sleep` to get the point across :)
    ///
    /// 假设需要很长时间, 我们使用 `sleep` 模拟这点.
    fn new(creation_time: Instant) -> Self {
        std::thread::sleep(Duration::from_millis(500));
        Self { creation_time }
    }
}

/// A type that needs to provide a cached value to callers.
///
/// 需要向调用者提供缓存值的类型.
struct SomethingWithCache {
    cache: LazyCell<BigType>,
}

impl SomethingWithCache {
    pub fn new() -> Self {
        Self {
            cache: LazyCell::new(|| BigType::new(Instant::now())),
        }
    }

    fn big_type(&self) -> &BigType {
        // this deref will initialize the type if not done already!
        //
        // 这里解引用在底层数据没有初始化时会触发初始化.
        //
        // otherwise, we'll just use the cached value...
        //
        // 否则, 直接用缓存了的数据.
        &*self.cache
    }
}
```

On the other hand, [`LazyLock`](https://doc.rust-lang.org/std/sync/struct.LazyLock.html) (`once_cell::sync::Lazy`) is often used on servers and in other high-performance scenarios. They work with concurrency and threading, and you'll also tend to find them inside `static` variables. These are a bit slower than `LazyCell`, but offer greater flexibility.

另一方面, [`LazyLock`](https://doc.rust-lang.org/std/sync/struct.LazyLock.html) (`once_cell::sync::Lazy`) 经常用于服务器和其他高性能场景, 允许多线程并发访问, 常见于静态变量. 比 LazyCell 慢一些, 但提供了更大的灵活性.

(译者注: 个人最爱这个, ~~结合 dashmap 当高性能无锁 kv 缓存~~. `LazyLock` 区分于 `LazyCell` 就是前者是后者的线程安全版本.)

```rust
/// Here's a static, which is accessible throughout the program.
///
/// Let's pretend that creating it takes a looooong time...
static BIG_SCARY_VARIABLE: LazyLock<BigType> = LazyLock::new(|| BigType::new(Instant::now()));

struct BigType {
    creation_time: Instant,
}

impl BigType {
    fn new(creation_time: Instant) -> Self { /* ... */ }
}
```

By the way, you may have noticed that you don't need to have any mutability to initialize these types. You can mutate them from behind a shared reference, as they use `unsafe` behind the scenes to mutate themselves.

顺便说一句, 您可能已经注意到, 初始化这些类型不需要任何可变性. 您可以从共享引用后面改变它们, 因为它们在幕后使用 `unsafe` 来改变自己.

When it lands on Stable, the [`lazy_get`](https://github.com/rust-lang/rust/issues/129333) Nightly feature will also allow you to replace the `Lazy` types' internal values with your own.

当它登陆稳定版时, [`lazy_get`](https://github.com/rust-lang/rust/issues/129333) 这个 Nightly feature 还允许您用自己的内部值替换 `Lazy` 类型的内部值.

(译者注: 我没留意到这个欸, 超实用的 feature)

Anyways, these types have always been around in one way or another. But now, you don't need to use an external crate!

不管怎么说, 这些类型一直以这样或那样的方式存在, 但现在, 您不需要使用第三方的 crate 了!

### The [`#[diagnostic::on_unimplemented]` Attribute](https://doc.rust-lang.org/stable/reference/attributes/diagnostics.html#the-diagnosticon_unimplemented-attribute)

This simple attribute is extremely influential - it lets you create your own compile errors for the user to see, all without a proc macro! Here's how it works:

这个简单的属性(attribute)非常有影响力: 它允许您创建自己的编译错误供用户查看, 所有这些都无需 proc 宏! 以下给出一个例子:

```rust
#[diagnostic::on_unimplemented(
    message = "tell the user what's going on",
    label = "oh hey im pointing at the failed code",
    note = "You may wish to add `#[derive(Cool)] on the affected item.",
    note = "If that's not an option, consider using `PartialCool` instead." // in my bevy era
)]
trait MyCoolTrait<'a> {
    fn buf(&self) -> &'a [u8];
}

struct CoolType<'data>(&'data [u8]);

impl<'data> MyCoolTrait<'data> for CoolType<'data> {
    fn buf(&self) -> &'data [u8] {
        self.0
    }
}

/// I wish that I could be like the cool kids
//
// 我希望我能像帅孩子~
struct UncoolType;

/// generic to types that impl `MyCoolTrait`
///
/// 泛型参数, 需要满足 `MyCoolTrait` 特质
fn func_with_cool_bounds<'data, Cool: MyCoolTrait<'data>>(cool_type: Cool) {
    println!("dang look at all this data: {:#?}", cool_type.buf())
}

fn main() {
    let cool_type: CoolType = CoolType(&[1, 2, 3]);
    let uncool_type: UncoolType = UncoolType;

    func_with_cool_bounds(cool_type); // all good. compiler is happy
    func_with_cool_bounds(uncool_type); // uh oh! but hey, a custom err message...
}
```

That last line there gives you the following error:

最后一行给出了以下错误:

```rust
    Checking rs_2024_article_codeblocks v0.1.0 (/Users/barrett/Downloads/rs_2024_article_codeblocks)
error[E0277]: tell the user what's going on
  --> src/diagnostics_on_unimpl.rs:32:27
   |
32 |     func_with_cool_bounds(uncool_type); // uh oh! but hey, a custom err ...
   |     --------------------- ^^^^^^^^^^^ oh hey im pointing at the failed code
   |     |
   |     required by a bound introduced by this call
   |
   = help: the trait `MyCoolTrait<'_>` is not implemented for `UncoolType`
   = note: You may wish to add `#[derive(Cool)] on the affected item.
   = note: If that's not an option, consider using `PartialCool` instead.
   = help: the trait `MyCoolTrait<'data>` is implemented for `CoolType<'data>`
```

This attribute is **vital** for making certain types of derive macros. Please give it a try if you maintain a crate relying heavily on traits, as this technique can seriously help to inform your users!

此属性对于制作某些类型的派生宏至关重要: 如果您维护一个严重依赖特质(trait)的 crate, 请尝试一下, 因为这种技术可以极大地帮助通知您的用户!

### [ABI Documentation | ABI 文档](https://doc.rust-lang.org/core/primitive.fn.html#abi-compatibility)

It's in a weird module, but under the primitive `fn` (function pointer, NOT `Fn` trait) module documentation, there is now [a section on ABI compatibility](https://doc.rust-lang.org/core/primitive.fn.html#abi-compatibility)!

它位于一个奇怪的模块中, 但在原始 `fn` (函数指针, 而不是 `Fn` 特质) 模块文档下, 现在有一个关于 ABI 兼容性的部分!

These can help a lot when relying on `#[repr(Rust)]` types. These docs seem most useful when writing alternative compilers (like [`mrustc`](https://github.com/thepowersgang/mrustc), [`gccrs`](https://rust-gcc.github.io/), or [Dozer](https://notgull.net/announcing-dozer/)), helping folks to start on the advanced intricacies of `rustc` instead of getting stuck on small ABI differences.

当依赖 `#[repr(Rust)]` 类型时, 这些可以有很大帮助. 这些文档在编写替代编译器(如 [`mrustc`](https://github.com/thepowersgang/mrustc), [`gccrs`](https://rust-gcc.github.io/), 或 [Dozer](https://notgull.net/announcing-dozer/))时似乎最有用, 可以帮助人们开始了解 `rustc` 的高级复杂性, 而不是陷入小的 ABI 差异.

(as a note, please support those projects I listed. alternative compilers are essential to the Rust ecosystem's continued development!)

(一个小提醒, 请支持我列出的那些项目. 替代编译器对于 Rust 生态系统的持续发展至关重要!)

## [`Option::inspect`](https://doc.rust-lang.org/stable/std/option/enum.Option.html#method.inspect), [`Result::inspect`](https://doc.rust-lang.org/stable/std/result/enum.Result.html#method.inspect), and [`Result::inspect_err`](https://doc.rust-lang.org/stable/std/result/enum.Result.html#method.inspect_err)

I'm in love with these methods. The two `inspect` methods are great for logging parsing progression, and `Result::inspect_err` feels almost vital at this point for logging on errors:

我爱上了这些方法(译者注: 我也是). 这两个 `inspect` 方法对于记录解析进度非常有用, 而 `Result::inspect_err` 在这一点上对于记录错误几乎至关重要:

```rust
let json: String = serde_json::to_string_pretty(report).inspect_err(|e| {
    tracing::warn!("Failed to make report into a pretty JSON string. (err: {e})")
})?;
```

I enjoy these so much that, in a few projects, I bumped up my MSRV just to use them. They make your code so nice to read...

我非常喜欢这些, 以至于在一些项目中, 我为了使用它们而提高了我的 MSRV(Minimum Supported Rust Version, 最低要求 Rust 版本). 它们让您的代码读起来非常好...

### [`core::ptr::from_ref::<T>` and `core::ptr::from_mut::<T>`](https://doc.rust-lang.org/stable/core/ptr/fn.from_ref.html)

These types, tracked in [Issue #106116](https://github.com/rust-lang/rust/issues/106116), are a great way to create raw pointers in the general case. They protect from the usual annoyances of `as` casting, where you can slightly bend the type system if not careful.

它们在 [Issue #106116](https://github.com/rust-lang/rust/issues/106116) 中进行跟踪, 是在一般情况下创建原始指针的好方法. 它们可以防止 `as` 带来的常见问题: 如果不小心, 您可能会 "掰弯" 类型系统(译者注: 如一个不小心 `i32` as `u32`, 这种操作常见于 FFI 边界).

If you use these types, please consider linting for an accidental swap of shared (`&`) and exclusive (`&mut`) references. See [`clippy::as_ptr_cast_mut`](https://rust-lang.github.io/rust-clippy/master/index.html#as_ptr_cast_mut) for more info.

如果您使用它们, 请考虑对共享 (`&`) 和独占 (`&mut`) 引用的意外交换进行 linting, 参阅 [`clippy::as_ptr_cast_mut`](https://rust-lang.github.io/rust-clippy/master/index.html#as_ptr_cast_mut).

### [Return-Position `impl Trait`... in Traits (`RPITIT`) | 在特质方法中返回 `impl Trait`...(`RPITIT`)](https://github.com/rust-lang/rust/pull/115822/)

It feels like those acronyms get longer each time I look. In any case, with Rust 1.75, traits can now use [`RPIT`](https://github.com/rust-lang/rfcs/blob/master/text/1522-conservative-impl-trait.md) like any other function/method item.

感觉每次我看这些缩写词都会变得更长(译者注: 我也是). 不管怎么样, 在 Rust 1.75 中, 特质(trait)现在可以像任何其他函数/方法一样使用 [`RPIT`](https://github.com/rust-lang/rfcs/blob/master/text/1522-conservative-impl-trait.md) (译者注: 暂且理解为返回一个 opaque type, 返回值能直接写成 `impl Trait` 吧).

These work just like you'd expect, so please see [the announcement blog post](https://blog.rust-lang.org/2023/12/21/async-fn-rpit-in-traits.html) for additional information.

这些工作正如您所期望的那样, 因此请参阅[公告博客文章](https://blog.rust-lang.org/2023/12/21/async-fn-rpit-in-traits.html)以获取更多信息.

### [Async Functions in Traits (`AFIT`) | 特质(trait)支持异步方法 (`AFIT`)](https://github.com/rust-lang/rust/pull/115822/)

The last PR also added async functions to traits, though they're a little knee-capped. Here's what that can look like:

上一个 PR 还为特质(trait)添加了异步函数, 尽管它们有点限制. 看起来是这样的:

```rust
pub trait Fart {
    async fn fart(&self) {
        tokio::time::sleep(std::time::Duration::from_millis(self.get_fart_time().await)).await;
        println!("<fart>");
    }

    async fn get_fart_time(&self) -> u64;
}

struct Bob;

impl Bob {
    const FART_TIME_MS: u64 = 300_u64;
}

impl Fart for Bob {
    async fn get_fart_time(&self) -> u64 {
        Self::FART_TIME_MS
    }
}

struct Sam;

impl Sam {
    const FART_TIME_MS: u64 = 600_u64; // much longer
}

impl Fart for Sam {
    async fn get_fart_time(&self) -> u64 {
        Self::FART_TIME_MS
    }
}

async fn main() {
    let bob = Bob;
    let sam = Sam;

    tokio::join! {
        bob.fart(),
        sam.fart()
    };
}

```

Note that these aren't yet fully functional, as traits that use it are no longer `dyn` compatible (new term for "object safe").

请注意, 这些尚未完全可用, 因为使用它的特质(trait)不再 `dyn` 兼容("对象安全"的新术语):

```rust
fn take_farter(farter: &dyn Fart) {}
```

leads to this error:

导致这个错误:

```rust
error[E0038]: the trait `afit::Fart` cannot be made into an object
  --> src/afit.rs:45:25
   |
45 | fn take_farter(farter: &dyn Fart) {}
   |                         ^^^^^^^^ `afit::Fart` cannot be made into an object
   |
note: for a trait to be "dyn-compatible" it needs to allow building a vtable to allow the call to be resolvable dynamically; for more information visit <https://doc.rust-lang.org/reference/items/traits.html#object-safety>
  --> src/afit.rs:4:14
   |
3  | pub trait Fart {
   |           ---- this trait cannot be made into an object...
4  |     async fn fart(&self) {
   |              ^^^^ ...because method `fart` is `async`
...
9  |     async fn get_fart_time(&self) -> u64;
   |              ^^^^^^^^^^^^^ ...because method `get_fart_time` is `async`
   = help: consider moving `fart` to another trait
   = help: consider moving `get_fart_time` to another trait
   = help: the following types implement the trait, consider defining an enum where each variant holds one of these types, implementing `afit::Fart` for this new enum and using it instead:
             afit::Bob
             afit::Sam
```

So, if you need to use trait objects (`dyn Farts` syntax), you'll want to add [a helper crate: `async_trait`](https://docs.rs/async-trait/latest/async_trait)!

因此, 如果您需要使用特质(trait)对象 (`dyn Farts` 这种语法), 您需要添加一个 [辅助 crate: `async_trait`](https://docs.rs/async-trait/latest/async_trait)!

(译者注: 例如 `axum` 里面重度使用了该 crate.)

```rust
use async_trait::async_trait;

#[async_trait]
pub trait Fart { /* ... */ }

#[async_trait]
impl Fart for Bob { /* ... */ }

#[async_trait]
impl Fart for Sam { /* ... */ }
```

Now, `take_farter` compiles just fine! :D

现在, take_farter 编译得很好! :D

Behind the scenes, though, this proc macro is doing a lot of work:

不过, 在幕后, 这个过程宏做了很多工作:

```rust
impl Fart for Bob {
    fn get_fart_time<'life0, 'async_trait>(
        &'life0 self,
    ) -> Pin<Box<dyn Future<Output = u64> + Send + 'async_trait>>
    where
        'life0: 'async_trait,
        Self: 'async_trait,
    {
        Box::pin(async move {
            if let Some(__ret) = None::<u64> {
                #[allow(unreachable_code)]
                return __ret;
            }
            let __self = self;
            let __ret: u64 = { Self::FART_TIME_MS };
            #[allow(unreachable_code)]
            __ret
        })
    }
}
    // ...
```

See that `Box` right there? That's a peek into the embedded trenches...

看到那里的 `Box` 吗? 这是对嵌入战壕的一瞥...

(译者注: 确实过于 "不优雅", 不过还好 `async_trait` 为我们处理好了...)

Nonetheless, this option is useful for binaries, but be careful when doing this stuff in your libraries. Additional changes are needed [for semantic versioning](https://blog.rust-lang.org/2023/12/21/async-fn-rpit-in-traits.html#is-it-okay-to-use---impl-trait-in-traits) to be consistent here.

尽管如此, 此选项对于二进制文件很有用, 但在库中使用时要小心, 需要注意[语义版本控制](https://blog.rust-lang.org/2023/12/21/async-fn-rpit-in-traits.html#is-it-okay-to-use---impl-trait-in-traits)在此处保持一致. (译者注: 即需要支持 Rust 1.75 以下.)

### [`const` Blocks](https://github.com/rust-lang/rust/pull/104087/)

When you need these, you *need* them. `const` evaluation has historically been a little difficult to control, governed by the internal (opaque) rules of the compiler [as it pursues `const` promotion](https://github.com/rust-lang/const-eval/blob/master/promotion.md). In libraries operating in low-level spaces, `const` eval can significantly impact performance, so many folks pursue it aggressively: if a maintainer has any doubt, they'll const-ify any parameter into a `const PARAM` just to encourage the compiler.

当您需要这些的时候, 您就需要它们. `const` 计算历来有点难以控制, 受编译器内部(不透明的)规则的控制, 因为[它追求尽可能 `const`(`const` promotion)](https://github.com/rust-lang/const-eval/blob/master/promotion.md). 底层库应用 `const` 计算将显著影响性能, 因此许多人积极追求它: 如果维护者有任何疑问, 他们会将任何参数常量化为 `const PARAM`, 只是为了鼓励编译器.

With `const` blocks, you can directly tell the compiler that it should simplify the given expression at compile-time.

使用 `const` 块, 您可以直接告诉编译器应该在编译时简化给定的表达式.

Here's a short example of how this looks:

简单的例子:

```rust
// probably not realistic but shhh pretend we're talking to an allocator
let m = allocate(const { 1024 * 8 });
```

If there was any doubt whether that would be evaluated by the compiler, it's gone now. Our troubles were dealt with at compile-time.

如果对编译器是否会对其进行计算有任何疑问, 那么现在就没了: 我们的麻烦在编译时就得到了解决.

### Some Extras | 一些额外的内容

Here are some other things I liked:

以下是我喜欢的其他一些东西:

- [zero memory (`core::mem::zeroed::<T>()`) is now `const`!](https://doc.rust-lang.org/stable/core/mem/fn.zeroed.html)
  - skirts the transmute

      绕过 `transmute`
- [`core::slice::chunk_by`](https://doc.rust-lang.org/stable/core/primitive.slice.html#method.chunk_by) and friends
  - these methods are a godsend for parsing

      这些方法对于解析来说是天赐之物.
- [`use<'a>` bounds (capture syntax) | `use<'a>` 语法](https://blog.rust-lang.org/2024/10/17/Rust-1.82.0.html#precise-capturing-use-syntax)
  - these let you better specify your lifetimes when using `impl Trait` syntax

      这些可以让您在使用 `impl Trait` 语法时更好地指定您的生命周期.
  - I still don't recommend this syntax in libraries due to difficulties with semantic versioning compatibility. however, it feels great in your binaries!

      由于语义版本控制兼容性方面的困难, 我仍然不推荐在库中使用这种语法. 然而, 在您的二进制文件中感觉很棒.
- [`c"my c string"` syntax to define c string literals | `c"my c string"` 语法创建 C 字符串字面量](https://github.com/rust-lang/rust/pull/117472/)
  - automatic `nul` termination

      自动 `nul`.
  - very useful in certain contexts.

      在某些情况下非常有用.
- [IP address stuff in `core`](https://doc.rust-lang.org/stable/core/net/index.html)
  - this is another thing that was just... gone on embedded

      这是另一件事... 嵌入式需要这玩意.
- `rustdoc` improvements
  - [Documentation now mentions `dyn` compatibility on items | 文档现在指出 `dyn` 兼容性](https://github.com/rust-lang/rust/pull/113241/)
  - [`/` to search | 按 `/` 搜索](https://github.com/rust-lang/rust/pull/123355/)
  - [Items aren't duplicated in searches](https://github.com/rust-lang/rust/pull/119912/)
    - makes preludes feel less disgusting

      让 precludes 看起来没那么恶心.
  - [You can hide bars when they're in the way](https://github.com/rust-lang/rust/pull/115660/)
    - top 1 change of 2024 for ADHD

      ADHD 人士心目中 2024 的 Top 1 变化.
  - [Search for traits' associated types](https://github.com/rust-lang/rust/pull/116085/)
    - helps you avoid clicking that "source" button... so alluring... 🤤

      帮助您避免点击 "source" 按钮... 如此诱人...🤤

## Wishlist for 2025 | 2025 愿望单

Ok, 2024 was great for Rust! But, there are still some things that are missing. Let's discuss my wishlist for Rust in 2025:

好吧, 2024 年对 Rust 来说是伟大的一年! 但是, 仍然缺少一些东西. 让我们讨论一下我对 2025 年 Rust 的愿望清单:

### [Compile-Time Reflection | 编译时反射](https://soasis.org/posts/a-mirror-for-rust-a-plan-for-generic-compile-time-introspection-in-rust)

Compile-time reflection is a construct to analyze source code at compile time. In short, it replaces small code generation tasks (think `serde`, `thiserror`, and [`bevy_reflect`](https://crates.io/crates/bevy_reflect)) with normal Rust source code.

编译时反射是在编译时分析源代码的构造. 简而言之, 它用普通的 Rust 源代码替换了小型代码生成任务(例如 `serde`, `thiserror` 和 [`bevy_reflect`](https://crates.io/crates/bevy_reflect)).

In my view, this is one of the few large-scale optimizations on compile time we've got left (you know... ignoring the whole batch compiler thing). It would vastly reduce compile times for the largest Rust binaries, especially for large applications like web servers.

在我看来, 这是我们剩下的少数几个尚未实现的大规模的编译时间优化手段之一, 它将大大减少 Rust 大型二进制文件的编译时间, 特别是对于 Web 服务器等大型应用程序.

Reflection would lessen the amount of `syn` we'd see slowly compiling alone, allowing Rust developers to iteratively make changes as if we hand-rolled all our `serde::De/Serialize` implementations, without giving up on our high-level constructs. It is my #1 prospect for the language - after this, everyone could go home until 2026. I would still be happy. (please don't though!)

反射将减少我们需要单独缓慢编译的 `syn` 数量, 允许 Rust 开发人员迭代地进行更改, 就像我们手动滚动所有 `serde::De/Serialize` 实现一样, 而不放弃我们的高级构造. 这是我对这门语言的第一大期望. 实现这个, 我们每个人都可以直接回家待到 2026 年, 我仍然会很高兴.(但请不要这样做!)

### [Modern `Allocator` Trait | 现代 `Allocator` 特质](https://doc.rust-lang.org/nightly/std/alloc/trait.Allocator.html)

Let's take a look at my favorite thing ever - the new `Allocator` trait's `allocate()` method:

让我们来看看我最喜欢的东西: 新的 `Allocator` 特质(trait)中的 `allocate()` 方法:

```rust
pub unsafe trait Allocator {
    fn allocate(&self, layout: Layout) -> Result<NonNull<[u8]>, AllocError>;

    // ...
}
```

Ok... do you see that? The `Result` in its return type?

好... 您看到了吗? 返回类型中的 `Result`?

This new allocator interface lets you fallibly manage your memory without checking for null pointers at every stage! Or, in other words, sane human beings can manage the memory in their applications without immediately resorting to unsafe. `Drop` is Rust's comfy `free`, but **`allocate` is finally giving Rust a comfy `malloc`**.

这个新的 allocator 接口可以让您有效管理内存分配, 而无需在每个阶段检查空指针! 或者, 换句话说, 理智的人可以管理应用程序中的内存, 而无需诉诸不安全的方法. 如 `Drop` 是 Rust 中舒适版本的 `free` 般, **`allocate` 最终给了 Rust 一个舒适的 `malloc`**.

This new allocator will be very impactful! I'll list a few benefits here:

这个新的 allocator 接口将非常有影响力! 我在这里列出一些好处:

- The Linux kernel can use Rusty memory management (i.e. unite [`kernel::alloc`](https://rust.docs.kernel.org/kernel/alloc/) with... everyone else)

  Linux 内核可以使用 Rusty 内存管理(即将 [`kernel::alloc`](https://rust.docs.kernel.org/kernel/alloc/) 与其他联合起来).
- Embedded developers won't have to fight demons to manage their allocators

  嵌入式开发人员不必与恶魔作斗争来管理他们的分配器.
- Crates using custom allocators for performance won't have to use global state

  使用自定义分配器来提高性能的 crate 不必强制改变全局分配器.
- Stuff will get faster in general :)

  一般来说, 事情会变得更快:)

Unfortunately, it's not done yet. If you have any ideas or needs that seem unfulfilled, please reach out to [the Allocators WG (working group) on Zulip](https://rust-lang.zulipchat.com/#narrow/stream/197181-t-libs.2Fwg-allocators)!

不幸的是, 它还没有完成. 如果您有任何未满足的想法或需求, 请联系 [the Allocators WG (working group) on Zulip](https://rust-lang.zulipchat.com/#narrow/stream/197181-t-libs.2Fwg-allocators)!

### [Enum Variant Types | 枚举变体类型](https://github.com/rust-lang/lang-team/issues/122)

When you write an enum, you sometimes want to pass around a variant for various reasons. Maybe it avoids [dozens of newtypes](https://github.com/onkoe/ghr/blob/0dd9e8f0d624ed40c692fb2619571c0a4ae55767/libghr/src/report/components/mod.rs#L172), powers your state machine, or helps in reducing boilerplate.

当您编写枚举时, 有时您会出于各种原因想要传递变体. 它也许可以避免数十种新类型, 为您的状态机提供强大助力, 或者有助于减少样板代码.

Unfortunately, Rust's `enum`s are not currently capable of these, as variants are not types. The workaround isn't pretty. I linked it above, but often, you'll end up using the [newtype pattern](https://doc.rust-lang.org/rust-by-example/generics/new_types.html) on all of your enum variants:

不幸的是, Rust 的 `enum` 目前无法实现这些, 因为变体不是类型. 解决方法并不漂亮. 我在上面链接了它, 但通常, 您最终会在所有枚举变体上使用 [newtype 模式](https://doc.rust-lang.org/rust-by-example/generics/new_types.html):

```rust
pub enum ComponentDescription {
    CpuDescription(CpuDescription),
    RamDescription(RamDescription),
    // ...
```

That's because, without it, you can't share each variant as a type. For example, if I know that this component has a `RamDescription`, then there's no use in pattern matching it out. A lot of Rust code would become significantly easier to read with variant types.

这是因为, 如果没有它, 您就无法将每个变体作为类型共享. 例如, 如果我知道这个组件有一个 `RamDescription`, 那么对其进行模式匹配就没有用了. 使用变体类型, 许多 Rust 代码将变得更容易阅读.

### Stabilization of `#[feature(let_chains)]`

I really love `let_chains`! With these, you can combine verbose instances of pattern matching into just a few lines.

我真的很喜欢 `let_chains`! 有了这些, 您可以将模式匹配的详细实例合并为几行:

(译者注: 我也很喜欢!)

```rust
let my_result: Result<u32, MyError> = Result::Ok(2025_u32);

if let Ok(res) = my_result
    && res > 2024_u32
{
    println!("ayo it's 2025!");
}
```

They're not currently stable, but I use them in all my Nightly projects! :)

它们目前不稳定, 但我在所有的 Nightly 项目中都使用它们! :)

### [ABI](https://github.com/rust-lang/rust/issues/111423)

I hope that `#[repr(Rust)]` **never** becomes stable. Read these for more info:

我希望 `#[repr(Rust)]` 永远不会进入`稳定` 阶段. 阅读以下内容以获取更多信息:

- [To Save C, We Must Save ABI](https://thephd.dev/to-save-c-we-must-save-abi-fixing-c-function-abi) by JeanHeyd Meneide ([phantomderp](https://github.com/ThePhD))
- [C Isn't A Programming Language Anymore](https://faultlore.com/blah/c-isnt-a-language/) by Aria Desires ([gankra](https://github.com/Gankra/))
- [Pair Your Compilers at the ABI Café](https://faultlore.com/blah/abi-puns/) by Aria Desires
- [The `glibc` `s390` ABI Break](https://lwn.net/Articles/605607/) by Jonathan Corbet on LWN.net

Oh... you came back! I didn't expect that!

哦... 您回来了! 我没想到会这样!

So anyways, Rust is considering its own stable ABI called `crabi`, with its own `repr` tag: `#[repr(crabi)]`. In short, this means you'd be able to write languages that "spoke" Rust. I think we'd start seeing more high-level systems languages (similar to [the now-defunct, and wonderful, June Language](https://www.sophiajt.com/search-for-easier-safe-systems-programming/) or Go) based on the `crabi` ABI model.

所以无论如何, Rust 正在考虑自己的稳定 ABI, 称为 `crabi`, 具有自己的 `repr` 标签: `#[repr(crabi)]`. 简而言之, 这意味着您将能够编写 "讲" Rust 的语言. 我认为我们会开始看到更多基于 `crabi` ABI 模型的高级系统语言（类似于[现已不复存在的精彩的 June Language](https://www.sophiajt.com/search-for-easier-safe-systems-programming/) 或 Go）.

Python would likely gain support for `crabi`, so I can imagine a world where the two languages have a large overlap in ecosystems.

Python 可能会获得对 `crabi` 的支持, 我可以想象这两种语言生态交叉的世界.

### [`adt_const_params` feature - Use Custom Types in Your `const` Generics](https://doc.rust-lang.org/beta/unstable-book/language-features/adt-const-params.html)

This one is nice. In essence, you can now share important info at compile-time without using `const` functions and parameters. These can encourage the compiler to evaluate related expressions at compile-time and avoid passing parameters around. Instead, it's engrained into the type system!

这个不错. 本质上,您现在可以在编译时共享重要信息, 而无需使用 `const` 函数和参数. 这些可以鼓励编译器在编译时评估相关表达式并避免传递参数. 相反, 它已根植于类型系统中!

### `Option::inspect_none`

This one sounds kinda funny, but I want a way to log when there's no value.

这听起来有点有趣, 但我想要一种在 `Option::None` 时记录日志的方法:

Like so:

例如:

```rust
let username: Option<String> = account.username().inspect_none(|| {
    tracing::error!("User does not have a username! (id: `{}`)", account.id())
});
```

Currently, we have to use `if account.username().is_none()`, which is a bit verbose for a logging construct.

目前, 我们必须使用 `if account.username().is_none()`, 这对于日志记录来说有点冗长.

## Closing Thoughts | 结束语

These are some of my favorite changes from 2024, and my hopes for 2025!
这些是 2024 年以来我最喜欢的一些变化, 以及我对 2025 年的希望!

Rust is doing its Annual Community Survey until December 23rd, 2024, so [please fill out the form](https://www.surveyhero.com/c/rust-annual-survey-2024) if you want to share your thoughts! (but blog posts work too)

Rust 正在进行年度社区调查, 截止日期为 2024 年 12 月 23 日(译者注: 不幸, 截至译稿截稿时已是 30 日), 因此如果您想分享您的想法, 请填写表格! (博客文章也可以)

[^1]: These invariants on references are mentioned [here in the RFC](https://github.com/rust-lang/rfcs/blob/master/text/2582-raw-reference-mir-operator.md#motivation). Note that they're incomplete, so additional invariants may exist. RFC 中提到了这些引用的前提保证. 请注意, 它们是不完整的.
