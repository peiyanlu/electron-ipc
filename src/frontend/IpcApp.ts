import {
  ipcChannel,
  IpcHostChannel,
  IpcHostFunctions,
  IpcHostNotifications,
  IpcInvokeReturn,
  IpcListener,
  IpcSocketFrontend,
  RemoveFunction,
} from '../common/IpcSocket'
import { PickAsyncMethods } from '../common/UtilityTypes'
import { IpcAppNotifyHandler } from './IpcHandler'


export class IpcApp {
  /**
   * ```
   * IpcApp.hostFunctions.ping()
   * ```
   */
  public static hostFunctions = IpcApp.makeIpcProxy<IpcHostFunctions>(IpcHostChannel.Functions)
  
  public static get isValid(): boolean { return undefined !== this._ipc }
  
  private static _ipc: IpcSocketFrontend | undefined
  
  private static get ipc(): IpcSocketFrontend { return this._ipc! }
  
  /**
   * 通过 Ipc 为提供的通道建立消息处理程序函数。当通过 [[BackendIpc.send]] 为通道发送消息时，将调用处理程序。
   * @param {string} channel
   * @param {IpcListener} handler
   * @returns {RemoveFunction}
   * @note Ipc is only supported if [[isValid]] is true.
   */
  public static addListener(channel: string, handler: IpcListener): RemoveFunction {
    return this.ipc.addListener(ipcChannel(channel), handler)
  }
  
  /**
   * Remove a previously registered listener
   * @param channel The name of the channel for the listener previously registered with [[addListener]]
   * @param listener The function passed to [[addListener]]
   */
  public static removeListener(channel: string, listener: IpcListener) {
    this.ipc.removeListener(ipcChannel(channel), listener)
  }
  
  /**
   * 通过 channel 向后端发送消息，并期望异步获得结果。处理程序必须通过 [[BackendIpc.handle]] 在后端建立
   * @param {string} channel
   * @param args
   * @returns {Promise<any>}
   */
  public static async invoke(channel: string, ...args: any[]): Promise<any> {
    return this.ipc.invoke(ipcChannel(channel), ...args)
  }
  
  /**
   * 通过 socket 发送消息。
   * @param {string} channel
   * @param data
   */
  public static send(channel: string, ...data: any[]) {
    return this.ipc.send(ipcChannel(channel), ...data)
  }
  
  /**
   * 通过 Ipc 通道在后端调用方法。
   * @param {string} channelName
   * @param {string} methodName
   * @param args
   * @returns {Promise<any>}
   */
  public static async callIpcChannel(channelName: string, methodName: string, ...args: any[]): Promise<any> {
    const retVal = (await this.invoke(channelName, methodName, ...args)) as IpcInvokeReturn
    if (undefined !== retVal.error) {
      const err = new Error(retVal.error.message)
      err.stack = retVal.error.stack
      throw err
    }
    return retVal.result
  }
  
  /** 创建一个类型安全的 Proxy 对象，以对已注册的后端接口进行 IPC 调用。*/
  public static makeIpcProxy<K>(channelName: string): PickAsyncMethods<K> {
    return new Proxy({} as PickAsyncMethods<K>, {
      get(_target, methodName: string) {
        return async (...args: any[]) => IpcApp.callIpcChannel(channelName, methodName, ...args)
      },
    })
  }
  
  /**
   * 创建一个类型安全的 Proxy 对象，以在已注册的后端处理程序上调用 IPC 函数，该处理程序接受“methodName”参数，后跟可选参数
   * @param {string} channelName
   * @param {string} functionName
   * @returns {PickAsyncMethods<K>}
   */
  public static makeIpcFunctionProxy<K>(channelName: string, functionName: string): PickAsyncMethods<K> {
    return new Proxy({} as PickAsyncMethods<K>, {
      get(_target, methodName: string) {
        return async (...args: any[]) => IpcApp.callIpcChannel(channelName, functionName, methodName, ...args)
      },
    })
  }
  
  /**
   * 触发 IpcHost 的 addListener
   *
   * ```
   * IpcApp.notifyIpcHost('notifyHost')
   * ```
   *
   * @param {T} methodName
   * @param {any} args
   */
  public static notifyIpcHost<T extends keyof IpcHostNotifications>(
    methodName: T,
    ...args: Parameters<IpcHostNotifications[T]>
  ) {
    return IpcApp.send(IpcHostChannel.HostNotify, methodName, ...args)
  }
  
  public static async startup(ipc: IpcSocketFrontend) {
    this._ipc = ipc
    
    if (this.isValid) {
      IpcAppNotifyHandler.register() // receives notifications from backend
    }
  }
  
  public static async shutdown() {
    this._ipc = undefined
  }
}
