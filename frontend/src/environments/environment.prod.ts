import packageInfo from '../../package.json';

export const environment = {
  appVersion: packageInfo.version,
  production: true,
  apiVersion: "v1",
  //apiUrl:"https://localhost:44320/api",
  //apiUrl:"http://localhost/api",
  apiUrl:"http://192.168.1.103/api",
  baseWebSocketUrl: 'wss://localhost:44333/hub',
  USERDATA_KEY: 'authf496fc5a9f17',
};
