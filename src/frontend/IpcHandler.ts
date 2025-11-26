import { IpcAppChannel, IpcAppNotifications, RemoveFunction } from '../common/IpcSocket.js'
import { IpcApp } from './IpcApp.js'


/**
 * send → addListener
 */
export abstract class AppNotificationHandler {
  public abstract get channelName(): string;
  
  public static register(): RemoveFunction {
    const impl = new (this as any)() as AppNotificationHandler
    return IpcApp.addListener(
      impl.channelName,
      (_evt: Event, funcName: string, ...args: any[]) => {
        const func = (impl as any)[funcName]
        if (typeof func !== 'function') {
          throw new Error(`Method "${ impl.constructor.name }.${ funcName }" not found on NotificationHandler registered for channel: ${ impl.channelName }`)
        }
        
        func.call(impl, ...args)
      },
    )
  }
}


export class IpcAppNotifyHandler extends AppNotificationHandler implements IpcAppNotifications {
  public get channelName() {
    return IpcAppChannel.AppNotify
  }
  
  public notifyApp() {
    console.log('收到了后端调用')
  }
}

