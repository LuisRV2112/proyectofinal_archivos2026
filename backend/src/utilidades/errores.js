// Cada clase trae su codigo HTTP; el middleware de errores lee error.estado.
export class ErrorApi extends Error {
  constructor(estado, mensaje, detalle = null) {
    super(mensaje);
    this.name = this.constructor.name;
    this.estado = estado;
    this.detalle = detalle;
  }
}

// 400
export class ErrorValidacion extends ErrorApi {
  constructor(mensaje, detalle) {
    super(400, mensaje, detalle);
  }
}

// 401: sin token, token invalido o credenciales incorrectas
export class ErrorNoAutenticado extends ErrorApi {
  constructor(mensaje = 'Se requiere iniciar sesión', detalle) {
    super(401, mensaje, detalle);
  }
}

// 403: autenticado pero sin permiso
export class ErrorProhibido extends ErrorApi {
  constructor(mensaje = 'No tienes permiso para realizar esta operación', detalle) {
    super(403, mensaje, detalle);
  }
}

// 404
export class ErrorNoEncontrado extends ErrorApi {
  constructor(mensaje = 'Recurso no encontrado', detalle) {
    super(404, mensaje, detalle);
  }
}

// 409: por ejemplo, nombre duplicado
export class ErrorConflicto extends ErrorApi {
  constructor(mensaje, detalle) {
    super(409, mensaje, detalle);
  }
}
