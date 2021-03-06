import * as express from 'express';
import hyphenate from 'hyphenate';
import { Resolvable } from 'villa';

import { Router } from './router';

export interface RouterOptions {
  prefix: string;
}

// TODO: use string literal type.
export type HttpMethod = 'all' | 'get' | 'post' | 'put' | 'delete' | 'fetch' | 'head' | 'options';

export abstract class Controller {
  routes: Route[];
}

export interface MethodOptions<TPermission> {
  /** Specify view path. */
  view?: string;
  /** Require authentication. */
  authentication?: boolean;
  /** Permission descriptor. */
  permission?: PermissionDescriptor<TPermission>;
  permissions?: PermissionDescriptor<TPermission>[];
}

export interface RouteOptions<TPermission> extends MethodOptions<TPermission> {
  /**
   * Path that will be appended to parent.
   *
   * Accepts:
   * 1. abc-xyz
   * 2. abc-xyz/:paramA/:paramB
   * 3. :paramA/:paramB
   */
  path?: string;
}

export interface Route {
  method: string;
  path: string | undefined;
  view: string | undefined;
  resolvedView?: string;
  handler: RouteHandler;
  authentication: boolean;
  permissionDescriptor?: PermissionDescriptor<any>;
}

export interface Request<TUser> extends express.Request {
  user: TUser;
}

export type ExpressRequest = express.Request;
export type ExpressResponse = express.Response;

export type RouteHandler = (req: Request<any>, res: ExpressResponse) => any;

/** @decorator */
export function route<TPermission>(method: HttpMethod, options: RouteOptions<TPermission> = {}) {
  return (controllerPrototype: Controller, name: string, descriptor: PropertyDescriptor) => {
    if (!controllerPrototype.routes) {
      controllerPrototype.routes = [];
    }

    let handler = descriptor.value;

    let {
      path,
      view,
      authentication = false,
      permission,
      permissions,
    } = options;

    if (typeof path !== 'string' && name !== 'default') {
      path = hyphenate(name, {
        lowerCase: true,
      });
    }

    let permissionDescriptor = permission ?
      permission : permissions ?
      new CompoundOrPermissionDescriptor(permissions) : undefined;

    controllerPrototype.routes.push({
      method: method.toLowerCase(),
      path,
      view,
      handler,
      authentication,
      permissionDescriptor,
    });
  };
}

/** @decorator */
export function method<TPermission>(options?: MethodOptions<TPermission>) {
  return (controller: Controller, name: HttpMethod, descriptor: PropertyDescriptor) => {
    return route(name, options)(controller, 'default', descriptor);
  };
}

/** @decorator */
export function get<TPermission>(options?: RouteOptions<TPermission>) {
  return route('get', options);
}

/** @decorator */
export function post<TPermission>(options?: RouteOptions<TPermission>) {
  return route('post', options);
}

export abstract class PermissionDescriptor<T> {
  abstract validate(userPermission: T): boolean | string;

  static or<T>(...permissions: PermissionDescriptor<T>[]): PermissionDescriptor<T> {
    return new CompoundOrPermissionDescriptor<T>(permissions);
  }

  static and<T>(...permissions: PermissionDescriptor<T>[]): PermissionDescriptor<T> {
    return new CompoundAndPermissionDescriptor<T>(permissions);
  }
}

export class CompoundOrPermissionDescriptor<T> extends PermissionDescriptor<T> {
  constructor(
    public descriptors: PermissionDescriptor<T>[],
  ) {
    super();
  }

  validate(permission: T): boolean | string {
    let redirection: string | undefined;

    for (let descriptor of this.descriptors) {
      let result = descriptor.validate(permission);

      if (typeof result !== 'string') {
        if (result) {
          return true;
        }
      } else if (typeof redirection !== 'string') {
        redirection = result;
      }
    }

    return typeof redirection === 'string' ? redirection : false;
  }
}

export class CompoundAndPermissionDescriptor<T> extends PermissionDescriptor<T> {
  constructor(
    public descriptors: PermissionDescriptor<T>[],
  ) {
    super();
  }

  validate(permission: T): boolean | string {
    for (let descriptor of this.descriptors) {
      let result = descriptor.validate(permission);

      if (typeof result !== 'string') {
        if (!result) {
          return false;
        }
      } else {
        return result;
      }
    }

    return true;
  }
}

export interface UserProvider<T> {
  get(req: ExpressRequest): Resolvable<T>;
  authenticate(req: ExpressRequest): Resolvable<T>;
}
