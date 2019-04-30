import Emitter from 'https://raw.githubusercontent.com/Mango/emitter/0.0.7/src/index.js';

class CQEventEmitter extends Emitter {

  emit(event: string, ...args) {
    const s = event.split('.');
    if (s.length === 0) return;
    for (let i = s.length; i > 0; i--) {
      super.emit(s.slice(0, i).join('.'), ...args);
    }
  }

}

export class CQHttp extends CQEventEmitter {

  [key: string]: any;

  constructor() {
    super();
    return new Proxy(this, {
      get: (target, property) => {
        if (property in target) {
          return Reflect.get(target, property);
        } else if (typeof property === 'string') {
          return (options) => this.callAction(property, options);
        }
        return undefined;
      }
    });
  }

  async callAction(method: string, options: any): Promise<any> {
    console.log(method);
    console.log(options);
    return Promise.resolve();
  }

}

export default CQHttp;
