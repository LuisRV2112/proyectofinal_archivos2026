/**
 * Errores propios de la API.
 *
 * Cada clase lleva su codigo HTTP, asi los servicios lanzan
 * `new ErrorConflicto('Ya existe ...')` sin pensar en codigos, y el middleware
 * final (middleware/errores.js) solo lee `error.estado` para construir la
 * respuesta. El codigo HTTP queda definido en un unico lugar.
 */
export class ErrorApi extends Error {
  constructor(estado, mensaje, detalle = null) {
    super(mensaje);
    this.name = this.constructor.name;
    this.estado = estado;
    this.detalle = detalle;
  }
}

/** 400: la entrada no cumple el formato o las reglas de validacion. */
export class ErrorValidacion extends ErrorApi {
  constructor(mensaje, detalle) {
    super(400, mensaje, detalle);
  }
}

/** 401: no hay token, es invalido, expiro o las credenciales no coinciden. */
export class ErrorNoAutenticado extends ErrorApi {
  constructor(mensaje = 'Se requiere iniciar sesión', detalle) {
    super(401, mensaje, detalle);
  }
}

/** 403: se sabe quien es, pero no tiene permiso sobre el recurso. */
export class ErrorProhibido extends ErrorApi {
  constructor(mensaje = 'No tienes permiso para realizar esta operación', detalle) {
    super(403, mensaje, detalle);
  }
}

/** 404: el recurso no existe (o esta fuera del alcance del usuario). */
export class ErrorNoEncontrado extends ErrorApi {
  constructor(mensaje = 'Recurso no encontrado', detalle) {
    super(404, mensaje, detalle);
  }
}

/** 409: la operacion choca con el estado actual (p. ej. nombre duplicado). */
export class ErrorConflicto extends ErrorApi {
  constructor(mensaje, detalle) {
    super(409, mensaje, detalle);
  }
}
