export const ipcChannel = (channel: string) => `ipc.${ channel }`


export type IpcListener = (evt: any, ...args: any[]) => void;


export type RemoveFunction = () => void;


export type IpcInvokeReturn =
  | { result: any, error?: never }
  | { result?: never, error: string };

export interface IpcSocket {
  send: (channel: string, ...data: any[]) => void;
  addListener: (channel: string, listener: IpcListener) => RemoveFunction;
  once: (channel: string, listener: IpcListener) => void;
  removeListener: (channel: string, listener: IpcListener) => void;
}


export interface IpcSocketFrontend extends IpcSocket {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}


export interface IpcSocketBackend extends IpcSocket {
  handle: (channel: string, handler: (...args: any[]) => Promise<any>) => RemoveFunction;
}


export enum IpcAppChannel {
  AppNotify = 'ipcApp-notify',
}

export enum IpcHostChannel {
  Functions = 'ipc-host',
  HostNotify = 'ipcHost-notify',
  Dialog = 'ipcHost-dialog',
}


export interface IpcAppNotifications {
  notifyApp: () => void;
}


export interface IpcHostNotifications {
  notifyHost: () => void;
}


export interface IpcHostFunctions {
  ping: () => Promise<NodeJS.ProcessVersions>;
}

