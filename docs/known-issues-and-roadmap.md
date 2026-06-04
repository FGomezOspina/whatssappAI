# Riesgos conocidos y hoja de ruta

Fecha de corte: 2026-06-03.

Este archivo separa lo que ya funciona de lo que todavia debe resolverse antes de operar con clientes reales.

## Antes de produccion

### P0: validar el sandbox de Kapso extremo a extremo

- Confirmar el payload real para texto, imagen y audio.
- Verificar que `x-webhook-signature` coincide con la serializacion usada por el backend.
- Confirmar envio de respuestas con el `Phone Number ID` del sandbox.
- Probar que solamente los celulares autorizados interactuan con el banco de pruebas.

Riesgo actual: las pruebas automatizadas usan fixtures representativos, pero aun no sustituyen una prueba real contra Kapso.

### P0: variables y secretos

- Usar `NODE_ENV=production` cuando se conecte un canal real.
- Definir obligatoriamente `KAPSO_WEBHOOK_SECRET`.
- Mantener llaves de Kapso, OpenAI y Supabase fuera de Git.
- Rotar cualquier llave que se haya compartido accidentalmente.

Riesgo actual: fuera de produccion el backend permite webhooks sin firma si no existe secreto, para facilitar desarrollo local.

### P1: concurrencia distribuida por cliente

La instancia local ya agrupa mensajes consecutivos durante una ventana configurable y serializa el procesamiento por `channel_user_id`. Antes de escalar horizontalmente, mover ese buffer y la cola a Redis o a un sistema compartido.

Riesgo actual: la cola vive en memoria y no coordina varias instancias del backend.

### P1: idempotencia durable

Mover las llaves procesadas a Supabase o Redis y registrar el estado de cada evento.

Riesgo actual: el dedupe actual vive en un `Set` de memoria. Se pierde al reiniciar y no se comparte entre varias instancias.

### P1: entrega confiable de respuestas

Implementar una tabla outbox o cola con reintentos y registrar por separado `Message failed`.

Riesgo actual: el webhook responde `200 OK` antes del procesamiento, como recomienda Kapso para evitar timeouts. Si falla OpenAI, Supabase o el envio saliente despues de responder, hoy solo queda un error en consola.

## Robustez tecnica

### Higiene del repositorio

`node_modules` fue retirado del tracking de Git y queda excluido por `.gitignore`. Las dependencias deben recuperarse con `npm install` a partir de `package.json` y `package-lock.json`.

Para iniciar un repositorio nuevo:

- Copia el codigo sin `node_modules`.
- Conserva `package.json` y `package-lock.json`.
- Ejecuta `npm install`.
- Confirma con `git status` que `node_modules` no aparece antes del primer commit.

El historial anterior todavia puede contener esos archivos; si se necesita reducir el tamano historico del repositorio, hazlo como una operacion separada de reescritura de historial.

### Multimedia

- Registrar tipo MIME y errores sin exponer datos personales.

La descarga valida URL publica y aplica limite de bytes y timeout configurables. Falta mejorar la observabilidad sin exponer datos personales.

### Supabase

- Agregar health check opcional para Supabase.
- Crear alertas ante fallos de lectura o escritura.
- Definir politicas RLS si se agrega un frontend.
- Revisar retencion de datos personales.

Riesgo actual: Supabase es obligatorio para resolver clientes y catalogo en produccion. Si falla la lectura del catalogo, el bot responde que no pudo cargarlo en ese momento para evitar inventar productos o precios.

### Observabilidad

- Logs estructurados con `messageId`, `channelUserId` anonimizado y duracion por etapa.
- Metricas de errores OpenAI, Supabase y Kapso.
- Panel de conversaciones fallidas.
- Trazabilidad del modelo usado y respuesta operativa vs humanizada.

Riesgo actual: los errores se imprimen en consola sin correlacion suficiente.

## Evolucion de producto

### Catalogo y stock

- El catalogo ya esta preparado para vivir en Supabase por cliente. Siguiente mejora: administrar stock real y disponibilidad por sede.
- Crear panel administrativo para marcas, referencias, presentaciones, precios e imagenes.
- Integrar disponibilidad e inventario real.

### Pedidos y pagos

- Integrar software de facturacion.
- Procesar comprobantes enviados por imagen.
- Validar transferencias antes de confirmar pago.
- Mantener auditoria de modificaciones del carrito.

### Calidad conversacional

- Ampliar ejemplos curados para cotizacion, varios productos, voz e imagenes.
- Construir una suite de regresion con conversaciones anonimizadas.
- Medir respuestas repetidas, preguntas innecesarias y falsas confirmaciones.
- Mantener el motor como autoridad comercial y reducir reglas textuales solamente cuando exista cobertura equivalente.

## Casos de regresion obligatorios

- Solicitar una presentacion inexistente.
- Cotizar uno o varios productos sin agregarlos.
- Agregar uno o varios productos consultados despues.
- Enviar varios productos en un mensaje.
- Confirmar con `asi esta bien`.
- Consultar desde una raza escrita con errores.
- Corregir cantidad o eliminar un item.
- Cambiar direccion.
- Repetir un pedido anterior.
- Enviar imagen con y sin texto.
- Enviar audio con y sin transcripcion de Kapso.
- Reenviar el mismo webhook.
- Enviar dos mensajes seguidos con poca diferencia de tiempo.
