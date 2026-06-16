# Riesgos Conocidos y Hoja De Ruta

Ultima revision: 2026-06-16.

Este documento lista riesgos vigentes y mejoras pendientes. No repite arquitectura ni pasos de instalacion; esos viven en `docs/project-context.md` y `docs/kapso-migration.md`.

## Antes De Operacion Comercial Amplia

### P0: validar Kapso extremo a extremo

Confirmar con el numero real:

- Webhook activo con evento `Message received`.
- Firma `x-webhook-signature` validada con el cuerpo crudo.
- `phone_number_id` asociado a Distrifinca en `client_channels`.
- Envio saliente con el mismo numero Kapso.
- Texto, imagen y audio reales.

Riesgo: las pruebas automatizadas no sustituyen una prueba real contra Kapso, OpenAI y Supabase.

### P0: secretos y entorno

- Usar `NODE_ENV=production` con canales reales.
- Definir obligatoriamente `KAPSO_WEBHOOK_SECRET`.
- Mantener llaves de Kapso, OpenAI y Supabase fuera de Git, capturas y chats.
- Rotar cualquier llave que se haya compartido accidentalmente.

Riesgo: fuera de produccion el backend puede aceptar webhooks sin firma si no existe secreto, para facilitar desarrollo local.

### P1: concurrencia distribuida

La instancia local agrupa mensajes consecutivos y serializa procesamiento por usuario. Antes de escalar horizontalmente, mover buffer, cola y locks a Redis, Supabase o una cola compartida.

Riesgo: con varias instancias pueden procesarse mensajes del mismo usuario fuera de orden.

### P1: idempotencia durable

Mover llaves procesadas a un almacenamiento compartido y registrar estado del evento.

Riesgo: el dedupe actual vive en memoria y se pierde al reiniciar.

### P1: entrega confiable

Implementar outbox o cola de respuestas salientes con reintentos y estado por mensaje.

Riesgo: el webhook responde `200 OK` antes de terminar el procesamiento. Si falla OpenAI, Supabase o el envio saliente despues, hoy queda principalmente en logs.

## Robustez Tecnica

### Supabase

- Agregar health check opcional de lectura/escritura.
- Alertar fallos de catalogo, estado y pedidos.
- Definir politicas RLS si aparece frontend.
- Revisar retencion de datos personales.

Riesgo: si Supabase falla en produccion, el bot no debe inventar productos ni precios.

### Observabilidad

- Logs estructurados con `messageId`, `phoneNumberId`, usuario anonimizado y duracion por etapa.
- Metricas de errores por proveedor: Kapso, OpenAI y Supabase.
- Panel de conversaciones fallidas.
- Trazabilidad entre respuesta operativa y respuesta humanizada.

Riesgo: los logs actuales ayudan a diagnosticar, pero no dan una vista operacional completa.

### Multimedia

- Registrar tipo MIME, tamano y causa de fallo sin exponer archivos ni datos personales.
- Medir latencia de descarga y transcripcion.
- Mantener limites de bytes y timeout ajustados al canal real.

Riesgo: imagen/audio puede fallar por URL vencida, archivo grande, MIME inesperado o timeout.

## Producto

### Catalogo y stock

- Administrar stock real y disponibilidad por sede.
- Crear panel para marcas, referencias, presentaciones, precios e imagenes.
- Auditar cambios de precio y disponibilidad.

### Pedidos y pagos

- Integrar facturacion.
- Procesar o validar comprobantes de pago.
- Mantener auditoria de modificaciones del carrito.
- Separar confirmacion de pedido, pago y despacho.

### Calidad conversacional

- Ampliar ejemplos curados con conversaciones anonimizadas.
- Construir suite de regresion basada en casos reales.
- Medir preguntas innecesarias, falsos positivos y respuestas repetidas.
- Mantener el backend como autoridad comercial.

### Matching De Productos

Ya existe:

- Busqueda por nombre, descripcion, aliases y nombres originales.
- FTS/trigram en Supabase con fallback fuzzy local.
- Consolidacion dinamica de typos compatibles.
- Validacion final contra catalogo completo.
- Segunda lectura visual cuando la primera es incompleta o ambigua.
- Selecciones pendientes para respuestas como `la segunda`, `esa` o `de 4kg`.

Pendiente:

- Medir falsos positivos entre referencias comercialmente parecidas.
- Crear conjunto anonimizado de evaluacion con imagenes reales.
- Observar costo de segunda lectura visual.
- Evaluar embeddings solo si FTS + fuzzy deja casos reales sin resolver.

## Regresiones Obligatorias

- Presentacion inexistente.
- Consulta de precio sin agregar al carrito.
- Cotizacion de varios productos.
- Agregar productos consultados despues.
- Varios productos en un mensaje.
- Confirmacion con `asi esta bien`.
- Consulta desde raza o abreviatura escrita con errores.
- Correccion de producto con `no, es...`.
- Seleccion de opcion mostrada previamente.
- Cambio de direccion.
- Repetir pedido anterior.
- Imagen con y sin texto.
- Imagen con variante critica visible.
- Audio con URL descargable.
- Audio con transcript de Kapso como respaldo.
- Reenvio del mismo webhook.
- Dos mensajes seguidos con poca diferencia.
