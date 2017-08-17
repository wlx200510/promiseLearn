
function Promise(executor) {
    var self = this;
    self.status = 'pending';
    self.data = undefined;
    self.onResolvedCallback = []; // resolve时的回调函数栈
    self.onRejectCallback = []; // reject时的回调函数栈

    function resolve(value) {
        // 更改promise的状态 依次执行resolve栈中的回调函数
        if (value instanceof Promise) {
            return value.then(resolve, reject);
        }
        setTimeout(function() {
            if (self.status === 'pending') {
                self.status = 'resolved';
                self.data = value;
                for(var i = 0, l = self.onResolvedCallback.length; i < l; i++) {
                    self.onResolvedCallback[i](value)  // 前一个函数的返回值传递给栈中的下一个函数
                }
            }
        })
    }

    function reject(reason) {
        setTimeout(function() {
            // 更改promise的状态 依次执行reject栈中的回调函数
            if (self.status === 'pending') {
                self.status = 'reject';
                self.data = reason;
                var l = self.onRejectCallback.length;
                if (l === 0) {
                    console.error(reason);
                }
                for(var i = 0; i < l; i++) {
                    self.onRejectCallback[i](reason);
                }
            }
        })
    }

    try {
        executor(resolve, reject);
    } catch(e) {
        reject(e);
    }
}
// 需要在then函数里面执行onResolved或者onRejected, 并根据返回值来确定promise1的结果，并且如果
// onResolved/onRejected返回的是一个Promise, promise2将直接取这个Promise的结果：

Promise.prototype.then = function(onResolved, onRejected) {
    var self = this
    var promise2  // then 方法返回的一个新的promise

    onResolved = typeof onResolved === 'function' ? onResolved : function(value) {return value} // 实现值的穿透
    onRejected = typeof onRejected === 'function' ? onRejected : function(reason) {throw reason}

    if (self.status === 'resolved') {
        /* 根据标准，如果promise1(此处即为this/self)的状态已经确定并且是resolved，
        我们调用onResolved因为考虑到有可能throw，所以我们将其包在try/catch块里*/
        return promise2 = new Promise(function(resolve, reject) {
            setTimeout(function() {
                try {
                    var x = onResolved(self.data)
                    resolvePromise(promise2, x, resolve, reject)
                } catch(e) {
                    reject(e) // 如果出错，以捕获到的错误作为promise2的结果
                }               
            })
        })
    } else if (self.status === 'rejected') {
        return promise2 = new Promise(function(resolve, reject) {
            setTimeout(function() {
                try {
                    var x = onRejected(self.data)
                    resolvePromise(promise2, x, resolve, reject)
                } catch(e) {
                    reject(e)
                }
            })
        })
    } else {
        /* 当前的Promise还处于pending状态，我们并不能确定调用onResolved还是onRejected，
        要把两种情况的逻辑做成callback放入原来promise题的回调数组中，逻辑整体变化不大*/
        return promise2 = new Promise(function(resolve, reject) {
            self.onResolvedCallback.push(function(value) {
                try {
                    var x = onResolved(self.data)
                    resolvePromise(promise2, x, resolve, reject)
                } catch (e) {
                    reject(e)
                }
            })

            self.onRejectCallback.push(function(reason) {
                try {
                    var x = onRejected(self.data)
                    resolvePromise(promise2, x, resolve, reject)
                } catch(e) {
                    reject(e)
                }
            })
        })
    }
}

Promise.prototype.catch = function(onRejected) {
    return this.then(null, onRejected)
}

// 测试用的方法
Promise.deferred = Promise.defer = function() {
    var dfd = {}
    dfd.promise = new Promise(function(resolve, reject) {
        dfd.resolve = resolve
        dfd.reject = reject
    })
    return dfd
}

/**
 * 下面的函数用途是根据promise1.then(onResolved, onRejected)中的onResolved, onRejected返回值x来决定
 * 这个表达式整体的返回值，作为promise2来表示，形参中的resolve和reject实际上是promise2中的两个实参
 */

 function resolvePromise(promise2, x, resolve, reject) {
    var then
    var thenCalledOrThrow = false

    if (promise2 === x) { // standard 2.3.1
        return reject(new TypeError('Chaining cycle detected for promise!'))
    }

    if (x instanceof Promise) { // standard 2.3.2
        // 如果x的状态还没有确定，那么它是有可能被一个thenable决定最终状态和值的
        // 所以这里需要做一下处理，而不能一概的以为它会被一个“正常”的值resolve
        if (x.status === 'pending') {
            x.then(function(value) {
                resolvePromise(promise2, value, resolve, reject)
            }, reject)
        } else {
            // 如果Promise的状态已经确定了，那么它肯定有一个“正常”的值，所以这里直接取它的状态
            x.then(resolve, reject)
        }
        return
    }

    if((x !== null) && ((typeof x === 'object') || (typeof x === 'function'))) {
        try {
            // 接下来需要判断x.then的类型 并要调用它 最好赋值给一个单独的变量来处理，提防getter
            then = x.then
            // 兼容所有种类的promise实现 共有三处用到thenCalledOrThrow 三选一(单例)
            if (typeof then === 'function') {
                then.call(x, function rs(y) {
                    if (thenCalledOrThrow) return
                    thenCalledOrThrow = true
                    return resolvePromise(promise2, y, resolve, reject)
                }, function rj(r) {
                    if (thenCalledOrThrow) return
                    thenCalledOrThrow = true
                    return reject(r)
                })
            } else {
                resolve(x)
            }
        } catch (e) {
            if (thenCalledOrThrow) return
            thenCalledOrThrow = true
            return reject(e)
        }
    } else {
        resolve(x)  // 获取到了链式调用的尾部 直接返回
    }
 }