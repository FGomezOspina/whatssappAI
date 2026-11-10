// Presentation policy based on the interpreted operation, never on phrases in
// the customer's message. A product inquiry must not reopen an unrelated cart.
function esConsultaInformativaProducto(interpretacion) {
  return interpretacion?.accion === 'consultar' && interpretacion.intencion !== 'carrito' &&
    !interpretacion.continuarFlujo && !interpretacion.carrito?.operacion &&
    !(interpretacion.productos || []).some(p => p.accion && p.accion !== 'consultar');
}

module.exports = { esConsultaInformativaProducto };
