const MyPromise = (() => {
    //状态信息
    const PENDING = "pending"
    const RESOLVED = "resolved"
    const REJECTED = "rejected"
    //使用Symbol是为了仅供内部使用
    //当前状态
    const PromiseStatus = Symbol("PromiseStatus")
    //当前值
    const PromiseValue = Symbol("PromiseValue")
    //then队列
    const thenables = Symbol("thenables")
    //catch队列
    const catchables = Symbol("catchables")
    //改变当前状态的函数
    const changeStatus = Symbol("changeStatus")
    //已决阶段的处理函数
    const settledHandler = Symbol("settledHandler")
    //每个后续处理函数
    const linkPromise = Symbol("linkPromise")

    return class {
        /**
         * 改变状态的函数
         * @param {*} data: 数据
         * @param {*} status: 要改变的状态，resolve 或 reject
         * @param {*} queue: 任务队列
         */
        [changeStatus](data, status, queue) {
            //如果已经是已决状态,那么直接结束
            if (this[PromiseStatus] !== PENDING) return;
            this[PromiseStatus] = status //修改当前状态
            this[PromiseValue] = data //修改值
            //变成已决阶段后，执行相应的队列函数
            queue.forEach(q => q(data))
        }
        //构造器
        constructor(executor) {
            //初始化
            this[PromiseStatus] = PENDING //当前状态
            this[PromiseValue] = undefined //当前值
            this[thenables] = [] //then任务队列
            this[catchables] = [] //catch任务队列
            /**
             * 定义 resolve 函数
             * @param {*} data: 要返回的数据
             */
            const resolve = (data) => {
                this[changeStatus](data, RESOLVED, this[thenables])
            }
            /**
             * 定义reject函数
             * @param {*} data: 要返回的数据
             */
            const reject = (data) => {
                this[changeStatus](data, REJECTED, this[catchables])
            }
            //执行
            executor(resolve, reject)
        }
        /**
         * then和catch的处理函数,分为两种情况,如果当前已经是已决状态,
         * 那么直接执行(此时直接执行也要加入事件队列中,无法模拟微队列,只能用宏队列实现下),如果当前还是未决状态, 
         * 那么把当前的处理函数加入相应的任务队列中
         * @param {*} handler 处理函数
         * @param {*} queue   处理队列
         */
        [settledHandler](handler, status, queue) {
            //如果不是函数，那么直接返回
            if (typeof handler !== "function") return
            if (this[PromiseStatus] === status) {
                //如果已经是已决状态,直接执行
                setTimeout(() => {
                    handler(this[PromiseValue])
                }, 0);
            } else {
                //处于未决状态,加入任务队列
                queue.push(handler)
            }
        }
        /**
         * 用于创建一个新的Promise, 当我们调用then和catch处理函数时, 会返回一个新的Promise
         * @param {*} thenable
         * @param {*} catchable 
         */
        [linkPromise](thenable, catchable) {
            /**
             * 返回一个新的Promise的状态处理,如果父级已经变为已决状态, 那么新的Promise也是已决状态
             * @param {*} data 
             * @param {*} handler 
             * @param {*} resolve 
             * @param {*} reject 
             */
            function exec(data, handler, resolve, reject) {
                try {
                    //获取返回值
                    const res = handler(data)
                    //如果返回的是一个Promise,此时我们直接处理一下就可以
                    if (res instanceof MyPromise) {
                        res.then(data => resolve(data), err => reject(err))
                    } else {
                        //改变状态,和修改值
                        resolve(res)
                    }
                } catch (error) {
                    reject(error)
                }
            }
            //返回新的Promise
            return new MyPromise((resolve, reject) => {
                //处理then的
                this[settledHandler](data => {
                    //如果传过来的thenable不是函数,那么直接resolve下并结束
                    if (typeof thenable !== "function") {
                        resolve(data)
                        return
                    }
                    //我们把操作相同的提取封装一下
                    exec(data, thenable, resolve, reject)
                }, RESOLVED, this[thenables])
                //处理catch的
                this[settledHandler](data => {
                    //如果传过来的thenable不是函数,那么直接reject下并结束
                    if (typeof catchable !== "function") {
                        reject(data)
                        return
                    }
                    //我们把操作相同的提取封装一下
                    exec(data, catchable, resolve, reject)
                }, REJECTED, this[catchables])
            })
        }

        //settled then处理函数
        then(thenable, catchable) {
            //每个then都要返回一个新的promise
            return this[linkPromise](thenable, catchable)
        }
        //settled catch处理函数
        catch (catchable) {
            return this[linkPromise](undefined, catchable)
        }
        /**
         * 当数组中的每一个值都变为resolved时,返回新的promise的值resolve为一个数组,数组的内容为proms每个Promise的结果,
         * 如果有一个变为rejected, 那么直接结束
         * @param {*} pros 假定为一个数组
         */
          static all(pros) {
              let resCount = 0;
              let resArr = [];
              return new MyPromise(function(resolve, reject) {
                pros.forEach(p => {
                  p.then(res => {
                    resArr.push(res);
                    if (++resCount === pros.length) {
                      resolve(resArr);
                    }
                  }, err => {
                    reject(err);
                  });
                });
              });
            }
        /**
         * 当数组中有一个处于已决状态,那么结束
         * @param {*} proms: 假定是一个数组 
         */
        static race(proms) {
            return new MyPromise((resolve, reject) => {
                proms.forEach(p => {
                    p.then(data => resolve(data), err => reject(err))
                })
            })
        }
        /**
         * 返回一个resolved状态的promise
         * @param {*} data 
         */
        static resolve(data) {
            //如果穿过来的是一个Promise，直接返回就可以
            if (data instanceof MyPromise) {
                return data
            }
            return new MyPromise(resolve => resolve(data))
        }
        /**
         * 返回一个rejected状态的promise
         * @param {*} err 
         */
        static reject(err) {
            return new MyPromise((resolve, reject) => {
                reject(err)
            })
        }
    }
})()
