<!-- ---
author: Oleksandr Prokhorenko, translated by Hantong Chen
title: "Rust 计算属性 (computed properties) 最佳实践"
pubDatetime: 2025-02-07T11:10:49.000+08:00
# modDatetime: 2025-02-07T11:10:49.000+08:00
featured: true
draft: false
tags:
  - rust
  - translation
  - twir
description: "所谓计算属性, 即需要根据已有数据计算的属性. Swift 和 JavaScript 之类的语言原生支持, 但 Rust 里需要明确的模式. 本指南涵盖了五种在 Rust 中实现计算属性的方法, 包括适用于并发代码的线程安全的解决方案."
--- -->

> `This Week in Rust (TWiR)` Rust 语言周刊中文翻译计划, 第 585 期
>
> 本文翻译自 Oleksandr Prokhorenko 的博客文章 [https://minikin.me/blog/computed-properties-in-rust](https://minikin.me/blog/computed-properties-in-rust), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 2 月 7 日晚, 于广州.

![GitHub last commit](https://img.shields.io/github/last-commit/han-rs/twir.han.rs?path=src%2F585%2Fcomputed-properties-in-rust.md&style=social&label=Last%20updated)

(译者注: 本文适合 `Rust` 新手阅读, `Rust` 熟手可跳过.)

# Computed Properties in Rust

Rust 计算属性 (computed properties) 最佳实践

<!-- ## Table of contents -->

## Introduction | 前言

Computed properties dynamically calculate values when accessed instead of storing them. While languages like `Swift` and `JavaScript` support them natively, `Rust` requires explicit patterns. This guide covers five approaches to replicate computed properties in `Rust`, including thread-safe solutions for concurrent code.

所谓计算属性 (computed properties), 即需要根据已有数据计算的属性. `Swift` 和 `JavaScript` 之类的语言原生支持计算属性, 但 `Rust` 里需要明确的模式. 本指南涵盖了五种在 `Rust` 中实现计算属性的方法, 包括适用于并发代码的线程安全的解决方案.

In `Swift`, a computed property recalculates its value on access:

在 `Swift` 中, 计算属性将在访问时重新计算:

```swift
struct Rectangle {
    var width: Double
    var height: Double

    var area: Double { // 计算属性
        width * height
    }
}

let rect = Rectangle(width: 10, height: 20)
print(rect.area) // 200
```

`Rust` doesn’t support this syntax, but we can achieve similar results with methods and caching strategies.

`Rust` 不支持此语法, 但是我们可以通过关联方法和缓存策略获得类似的结果.

## Using Getter Methods (No Caching) | 使用 Getter 方法 (无缓存)

📌 Best for: Simple calculations or frequently changing values.

📌 最适用于: 计算简便或经常变化的值.

🦀 `Rust` Implementation | `Rust` 实现

```rust
#[derive(Debug)]
struct Rectangle {
    width: f64,
    height: f64,
}

impl Rectangle {
    fn area(&self) -> f64 {
        self.width * self.height
    }
}

fn main() {
    let rect = Rectangle { width: 10.0, height: 20.0 };
    println!("Area: {}", rect.area()); // 200.0
}
```

👍 Pros | 优点:

- Always up-to-date. 总是最新的.
- No dependencies. 没有依赖性.
- Zero overhead for caching or locking. 没有缓存或锁定的额外开销.

👎 Cons | 缺点:

- Recomputed on every call (no caching). 每次调用都会重新计算 (无缓存).

## Using Lazy Computation with `OnceLock` (Efficient Caching) 使用 `OnceLock` 进行惰性计算 (积极缓存)

📌 Best for: Immutable data with expensive computations.

📌 最适用于: 计算极其耗费资源的不变的数据.

`Rust`’s `OnceLock` lets you lazily compute a value one time. Once written, you cannot reset or invalidate it — perfect for data that never changes.

`Rust` 的 `OnceLock` 允许您惰性计算并存储结果(译者注: 调用 [`OnceLock::get_or_init`](https://doc.rust-lang.org/beta/std/sync/struct.OnceLock.html#method.get_or_init) 传入初始化方法在未初始化时初始化, 或者调用 [`OnceLock::set`](https://doc.rust-lang.org/beta/std/sync/struct.OnceLock.html#method.set) 直接存储一个结果), 往后您就无法修改了 — 非常适合(初始化后)永不更改的数据.

🦀 `Rust` Implementation | `Rust` 实现

```rust
use std::sync::{Arc, OnceLock};
use std::thread;

#[derive(Debug)]
struct Rectangle {
    width: f64,
    height: f64,
    cached_area: OnceLock<f64>,
}

impl Rectangle {
    fn new(width: f64, height: f64) -> Self {
        Self { width, height, cached_area: OnceLock::new() }
    }

    fn area(&self) -> f64 {
        *self.cached_area.get_or_init(|| {
            println!("Computing area...");
            self.width * self.height
        })
    }
}

fn main() {
    // Create the Rectangle in a single-threaded context.
    let mut rect = Rectangle::new(10.0, 20.0);

    // Compute area (first time, triggers computation).
    println!("First call: {}", rect.area()); // Computes and caches
    // Use cached value
    println!("Second call: {}", rect.area()); // Uses cached value

    // Modify width but does NOT invalidate the cache.
    rect.width = 30.0; // Has no effect on cached area

    // Prove that area() is still the cached value.
    println!("After modifying width: {}", rect.area()); // Still 200, not 600

    // Move rect into an Arc when we need multi-threading.
    let rect = Arc::new(rect);

    // Proving Thread-Safety
    let rect_clone = Arc::clone(&rect);
    let handle = thread::spawn(move || {
        println!("Thread call: {}", rect_clone.area());
    });

    handle.join().unwrap();

    println!("Final call: {}", rect.area());
}
```

🖨️ Expected Output | 预期输出

```stdout
Computing area...
First call: 200
Second call: 200
After modifying width: 200
Thread call: 200
Final call: 200
```

👍 Pros | 优点:

- Thread-safe once enclosed in Arc. 线程安全 (译者注: 参见 `OnceLock` 文档, 线程不安全版本为 `OnceCell`).
- Zero overhead after first initialization. 首次初始化后零开销 (译者注: 还是有检查是否初始化完成的开销的).

👎 Cons | 缺点:

- No invalidation: once set, remains forever. 不会失效：一旦设置, 永久保留.
- Only for immutable data (or if you never need to re-compute). 仅用于不变的数据 (或者您永远不需要重新计算).

## Mutable Caching with RefCell | `RefCell` 实现可变缓存

📌 Best for: Single-threaded mutable data, where the computed value can be invalidated or re-computed multiple times.

📌 最适用于: 单线程数据, 需要可变性.

`Rust`’s interior mutability pattern allows us to store a cache (such as an `Option<f64>`) behind an immutable reference. `RefCell<T>` enforces borrowing rules at runtime rather than compile time.

`RefCell<T>` 具备内部可变性, 将编译时借用检查挪到运行时.

🦀 `Rust` Implementation | `Rust` 实现

```rust
use std::cell::RefCell;
use std::sync::atomic::{AtomicUsize, Ordering};

static COMPUTE_COUNT: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug)]
struct Rectangle {
    width: f64,
    height: f64,
    // Cache stored in RefCell for interior mutability
    cached_area: RefCell<Option<f64>>,
}

impl Rectangle {
    fn new(width: f64, height: f64) -> Self {
        Self { width, height, cached_area: RefCell::new(None) }
    }

    fn area(&self) -> f64 {
        let mut cache = self.cached_area.borrow_mut();
        match *cache {
            Some(area) => {
                println!("Returning cached area: {}", area);
                area
            }
            None => {
                println!("Computing area...");
                let area = self.width * self.height;
                // Only for debugging purposes to track how many times the area is actually computed.
                COMPUTE_COUNT.fetch_add(1, Ordering::SeqCst);
                *cache = Some(area);
                area
            }
        }
    }

    fn set_size(&mut self, width: f64, height: f64) {
        println!("Updating dimensions and clearing cache...");
        self.width = width;
        self.height = height;
        self.cached_area.replace(None); // Invalidate the cache
    }

    fn invalidate_cache(&self) {
        println!("Invalidating cache...");
        self.cached_area.replace(None);
    }
}

fn main() {
    let mut rect = Rectangle::new(10.0, 20.0);

    println!("First call: {}", rect.area()); // Computes
    println!("Second call: {}", rect.area()); // Cached

    rect.set_size(15.0, 25.0); // Mutates and invalidates cache
    println!("After resize: {}", rect.area()); // Recomputes

    rect.invalidate_cache(); // Manually invalidate cache
    println!("After cache invalidation: {}", rect.area()); // Recomputes

    println!("Times computed: {}", COMPUTE_COUNT.load(Ordering::SeqCst)); // Should be 3
}
```

<details>
<summary>译者注</summary>

注意到示例大量使用 [`Ordering::SeqCst`](https://doc.rust-lang.org/std/sync/atomic/enum.Ordering.html), 实际上在业务中不推荐, 推荐阅读 [The Rustonomicon's Github repo, issue 166](https://github.com/rust-lang/nomicon/issues/166) 获取更多信息.

至于推荐用法, 简单总结如下:

- 对于 `fetch_xxx` 一类先读后写的, 应当使用 `AcqRel`
- 读取 (load) 用 `Acquire`
- 写入 (store) 用 `Release`
- 对原子性没多大需求, 例如只是简单计数的场景, 用 `Relax` 即可

</details>

🖨️ Expected Output | 预期输出

```stdout
Computing area...
First call: 200
Returning cached area: 200
Second call: 200
Updating dimensions and clearing cache...
Computing area...
After resize: 375
Invalidating cache...
Computing area...
After cache invalidation: 375
Times computed: 3
```

👍 Pros | 优点:

- Handles mutable data. 数据可变.
- Explicit invalidation available. (译者注: 即可让缓存失效然后刷新)

👎 Cons | 缺点:

- Not thread-safe. (译者注: 都用 `RefCell` 了, 自然线程不安全, 更 `Rust` 的说法就是 not `Sync`)
- Runtime borrow checks add overhead. 运行时借用检查添加开销(译者注: 运行时检查也让 BUG 更难找, 把借用检查推到运行时也丧失 `Rust` 编译时阻止大部分内存不安全操作优势了. 除非是 cpp 熟练应用者转 `Rust`, 否则慎用, 也无多大优势.)

## Thread-Safe Caching with `Mutex` | 带有 `Mutex` 的线程安全缓存

📌 Best for: Shared data across threads, when updates or caching need exclusive access.

📌 最适用于: 跨线程共享数据, 读取或写入是独占性的 (译者注: 即 `Mutex` 的特性)

For multi-threaded scenarios, we can wrap our cache in a `Mutex<Option<f64>>`. The Mutex enforces mutual exclusion, meaning only one thread can compute or update the cache at a time.

对于多线程场景, 我们可以将缓存包裹在 `Mutex` 内, 如 `Mutex<Option<f64>>`, 限制只有一个线程可以进行操作.

🦀 `Rust` Implementation | `Rust` 实现

```rust
use std::sync::{Arc, Mutex};
use std::thread;

struct Rectangle {
    width: f64,
    height: f64,
    cached_area: Mutex<Option<f64>>,
}

impl Rectangle {
    fn new(width: f64, height: f64) -> Self {
        Self { width, height, cached_area: Mutex::new(None) }
    }

    fn area(&self) -> f64 {
        let mut cache = self.cached_area.lock().unwrap();
        match *cache {
            Some(area) => area,
            None => {
                println!("Computing area...");
                let area = self.width * self.height;
                *cache = Some(area);
                area
            }
        }
    }
}

fn main() {
    let rect = Arc::new(Rectangle::new(10.0, 20.0));
    let mut handles = vec![];

    // Spawn 4 threads
    for _ in 0..4 {
        let rect = Arc::clone(&rect);
        handles.push(thread::spawn(move || {
            println!("Area: {}", rect.area());
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

<details>
<summary>译者注</summary>

对于 `Mutex`, 标准库中 `Mutex` 在部分线程 panic 情况下会导致 "中毒" (poisoned) 的问题, 在生产应用中, 常使用来自第三方库的 `Mutex` 实现, 例如:

- [`parking_lot::Mutex`](https://docs.rs/parking_lot/latest/parking_lot/type.Mutex.html)
  参阅其官方文档.

- [`antidote::Mutex`](https://docs.rs/antidote/latest/antidote/struct.Mutex.html)
  只是标准库实现的简单包装, 但是方法都不是 const 的, 在全局变量的场景下用不了, 我的 PR 也没见官方合并...

- [`tokio::sync::Mutex`](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html)
  一般用不着, **除非你确信你需要跨线程共享 MutexGuard**, 但是很不推荐这么干, 最佳实践应该是即锁即用, 用完立即释放 (即 drop 掉 MutexGuard, 可以说离开作用域自动 Drop, 或者手动 Drop).

更多地, 还需要指出一个常见问题 (cargo clippy 应该也会提示).

一个 [示例](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=7dbd4ab66d729b935f6b5ad5bfe093dd):

```rust
use std::sync::Mutex;

fn main() {
    let data: Mutex<Option<i32>> = Mutex::new(None);
    
    // try uncomment the following line?
    *data.lock().unwrap() = Some(1);
    
    // test code
    {
        if let data @ Some(_) = data.lock().unwrap().as_ref() {
            println!("Get: {data:?}");
        } else {
            // 问: 此时前面 `data.lock()` 上的锁解除了吗?
            *data.lock().unwrap() = Some(1);
        }
    }
    
    println!("After: {:?}", data.lock().unwrap());
}
```

答案是没有.

不信? 第一次遇到这种情况, 直觉肯定是已经离开作用域了, `else` 里面再锁没问题. 但是实际上整块 `if else` 都在一个作用域内, `if let` 只是个特殊的写法罢了.

你可以在 [playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=7dbd4ab66d729b935f6b5ad5bfe093dd) 里面注释掉首个 `*data.lock().unwrap() = Some(1);`, 点击 `Run` 看看会发生什么(会卡很久没反应, 直到超出官方 Playground 对于单次运行时间的限制).

当然, 要善于利用 `cargo clippy`, 聪明的 clippy 会明确阻止你那么干(虽然编译器是能编译通过的):

```stdout
    Checking playground v0.0.1 (/playground)
error: calling `Mutex::lock` inside the scope of another `Mutex::lock` causes a deadlock
  --> src/main.rs:11:9
   |
11 |           if let data @ Some(_) = data.lock().unwrap().as_ref() {
   |           ^                       ---- this Mutex will remain locked for the entire `if let`-block...
   |  _________|
   | |
12 | |             println!("Get: {data:?}");
13 | |         } else {
14 | |             *data.lock().unwrap() = Some(1);
   | |              ---- ... and is tried to lock again here, which will always deadlock.
15 | |         }
   | |_________^
   |
   = help: move the lock call outside of the `if let ...` expression
   = help: for further information visit https://rust-lang.github.io/rust-clippy/master/index.html#if_let_mutex
   = note: `#[deny(clippy::if_let_mutex)]` on by default

error: could not compile `playground` (bin "playground") due to 1 previous error
```

`Rust` 2024 Edition 以后, 打了个 `if_let_rescope` 的补丁, 参见 [https://github.com/rust-lang/rust/issues/131154](https://github.com/rust-lang/rust/issues/131154). [相同的代码](https://play.rust-lang.org/?version=nightly&mode=debug&edition=2024&gist=23c5eda602333bf33e41016088fdf01c) 就能正常跑了:

![2024 Edition](../../assets/images/25-02-07-Computed-Properties-in-Rust-1.png)

此前你只能老老实实用[这种写法](https://play.rust-lang.org/?version=nightly&mode=debug&edition=2021&gist=53b4918a581d87be0d47f59d572fcd49):

```rust
use std::sync::Mutex;

fn main() {
    let data: Mutex<Option<i32>> = Mutex::new(None);
    
    // try uncomment the following line?
    // *data.lock().unwrap() = Some(1);
    
    // test code
    {
        let guard = data.lock().unwrap();
        if let data @ Some(_) = guard.as_ref() {
            println!("Get: {data:?}");
        } else {
            drop(guard); // 显式 drop 掉 MutexGuard
            *data.lock().unwrap() = Some(1);
        }
    }
    
    println!("After: {:?}", data.lock().unwrap());
}
```

</details>

🖨️ Expected Output | 预期输出

```stdout
Computing area...
Area: 200
Area: 200
Area: 200
Area: 200
```

👍 Pros | 优点:

- Thread-safe. 线程安全.
- Computes once across threads. 跨再多线程都只需要计算一次.

👎 Cons | 缺点:

- Locking overhead (all threads block during the write). 有锁.

## Optimized Reads with `RwLock` | 读优化的 `RwLock`

译者注:

内容和 `Mutex` 类似, 只不过换成 `std::sync::RwLock` 了, 不再翻译.

但需要指出: 除非你确信并发读远多于写, 否则 `Mutex` 速度反而可能更快, 不要被迷惑. 个中原因应归咎于 `Rust` 的 `RwLock` 实际上依赖于操作系统实现, 而 `Mutex` 是纯 `Rust` 实现.

遇事不决就多 bench, 对于本文所述作计算属性用, `Mutex` 在大部分情况下足矣.

## Comparison Table | 比较表

| Approach | Use Case | Thread-Safe | Overhead | Invalidation |
|:---:|:---:|:---:|:---:|:---:|
|方法|使用场景|线程安全否?|开销||
| Getter Method | Simple, non-cached values | ✅ | None | Always recomputed |
| OnceCell | Immutable, expensive computations | ✅ | Low | Not possible (one-and-done) |
| RefCell | Single-threaded mutable data | ❌ | Moderate | Manual (replace(None)) |
| Mutex | Thread-safe, shared data | ✅ | High | Manual (lock & reset Option) |
| RwLock | Read-heavy concurrent access | ✅ | High | Manual (write lock & reset) |

## Final Thoughts | 后话

`Rust` might not have Swift-like computed properties built into the language syntax, but it more than compensates with low-level control and flexible lazy/cached patterns. Whether you pick a simple method, an interior-mutability cache, or a multi-threading–friendly lock-based approach, `Rust` gives you a safe, explicit way to manage when and how expensive computations run.

`Rust` 没有内置的类似于 `Swift` 中的计算属性, 但可以通过低级控制和灵活的惰性执行/缓存模式替代实现类似功能. 无论您选择简单的 Getter 方法, 内部可变性缓存还是上锁, `Rust` 都可以为您提供安全明确的方法决定何时进行昂贵的计算.

- Getter methods for no caching. Getter 方法, 没有缓存.
- `OnceLock` (or `OnceCell`) for one-time lazy initialization on immutable data. 用于不变数据的一次性的惰性初始化.
- `RefCell` for single-threaded mutable caching with manual invalidation. 用于手动使失效的的单线程环境下的内部可变性缓存.
- `Mutex` / `RwLock` for multi-threaded caching, balancing read concurrency and write locking. 用于多线程缓存, 平衡并发读和写锁定.

Choose the pattern that aligns with your data’s mutability, concurrency, and performance needs. `Rust`’s explicit nature means you’re always in control of exactly when and how a property is computed, updated, or shared across threads.

选择与您的数据可变性、并发性和性能需求相匹配的模式. `Rust` 的显式特性意味着您始终可以精确控制属性何时以及如何被计算、更新或在线程间共享.

(译者注: 计算完成后不需要可变选 `OnceLock`, 否则 `Mutex`)
