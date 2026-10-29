# Datos de cierre y factura electrónica — 2026-10-28

Implementación local en WhatsappVELTIA. Sin push, despliegue, reinicio, mensajes de WhatsApp, pedidos reales ni cambios de esquema/RLS/credenciales.

## Diagnóstico

- `camposDomicilioFaltantes()` exigía siempre cédula y correo, tanto para domicilio normal como para factura.
- Las instrucciones del intérprete y del router repetían esa obligación general.
- Dos mezclas `{ ...datos, ...estado.datosDomicilio }` hacían prevalecer valores antiguos sobre correcciones actuales.
- La extracción heurística asignaba números sueltos a cédula y utilizaba un orden posicional; podía confundir documento, celular y otros números.
- Algunas rutas llegaban al resumen o a la confirmación usando presencia de valores, sin validar su formato.

## Implementación

- Estado `facturacionElectronica`, booleano, inicialmente `false`. La presencia de cédula/NIT o correo nunca lo activa. Una solicitud explícita lo activa; una negación/corrección lo desactiva. Cada nuevo pedido vuelve al modo normal salvo solicitud explícita en su propio mensaje.
- La extracción semántica admite `facturacion: { electronica, evidencia }`; la evidencia debe citar texto real del mensaje y referirse explícitamente a facturación electrónica. Las consultas genéricas y los datos fiscales solos no bastan. Continúa usando los modelos configurados.
- Pedido normal: nombre completo, dirección, celular y pago. Electrónica: esos datos, cédula/NIT y correo; admite razón social en el campo existente `nombre` y NIT en `cedula`.
- Datos nuevos válidos se fusionan sin borrar datos previos con valores vacíos, null o inválidos. Se conservan entre turnos y al recargar el estado. Las respuestas solicitan juntos exclusivamente los faltantes.
- Parser por etiquetas/tipos y contexto, sin asignación posicional. Conserva nombres, direcciones y pagos aportados en mensajes combinados. Un NIT que empieza por 3 o números de un email no se toman por celular, incluso si el intérprete propone esa confusión.
- Validación de formato de nombre, documento, correo, celular colombiano y dirección; un primer nombre aislado puede conservarse como dato parcial, pero no completa el requisito de nombre completo. No consulta identidad tributaria ni confirma existencia de correo/dirección con servicios externos.
- Efectivo/contraentrega, transferencia, débito/crédito y llave Bre-B. Bre-B queda distinguido en `metodoPago`, conservando las instrucciones de pago autorizadas. No hay cobros ni solicitud de credenciales.
- Cuando faltan datos no permite cerrar. Cuando están completos muestra el resumen y conserva la confirmación final, clave de pedido e idempotencia existentes. Una dirección completa corregida conduce al resumen sin preguntar nuevamente si los otros datos siguen iguales.
- El humanizador protege tanto el resumen normal como el de electrónica. El contrato extra de facturación no se incluye en el perfil compacto exclusivo de productos, conservando su presupuesto de contexto.

## Archivos principales

- `src/verticals/petshop/checkoutData.js`: decisión de factura, validadores, fusión y regla compartida del intérprete.
- `src/verticals/petshop/orderLogic.js`: captura, faltantes, resumen, correcciones y guardas de cierre.
- `src/services/conversationService.js`: conserva datos del turno antes de elegir la ruta comercial.
- `src/services/aiInterpreter.js`, `src/services/aiContextOptimizer.js`: contrato/instrucciones y contexto de la variante, sin cambios de modelos.
- `src/services/humanizer.js`: protección del resumen de electrónica.
- `src/conversation/conversationStore.js`: valor predeterminado compatible con estados antiguos.
- `src/repositories/supabaseConversationRepository.js`: variante incluida en el snapshot del pedido.
- `test/checkoutVariants.test.js`: 19 pruebas nuevas. `test/conversationStorePersistence.test.js`: ambas variantes con repositorio real y transporte simulado.

## Ejemplos sintéticos comprobados

Normal:

`Celular: +57 300 000 0000; Dirección: Calle 20 # 30-40; Nombre: Ana Prueba; pago: contraentrega`

Resultado: conserva los cuatro datos, muestra productos/total/domicilio/pago y pasa a la confirmación final. No pide ni muestra cédula o correo como requisitos.

Electrónica sobrevenida:

Después del mensaje anterior: `Ahora necesito factura electrónica`.

Resultado: solicita únicamente `cedula o NIT` y `correo`. Tras recibirlos pasa al resumen de electrónica. `No necesito factura electrónica` elimina esos requisitos y conserva domicilio/pago.

Electrónica completa:

`Necesito factura electrónica; Celular: 3000000000; Dirección: Calle 20 # 30-40; pago: efectivo; Correo: compras@example.com; NIT: 900.000.001-1; razón social: Empresa Prueba SAS`

Resultado: normaliza NIT, conserva razón social y todos los datos; muestra el resumen sin pedir campos otra vez.

## Persistencia: evidencia y alcance

Se consultó únicamente el documento OpenAPI real de Supabase mediante GET, con las credenciales existentes sin mostrarlas. Resultado:

| Tabla | Campos existentes verificados |
|---|---|
| `whatsapp_conversations` | `customer: jsonb`, `state: jsonb`, `client_id: uuid` obligatorio |
| `whatsapp_orders` | `order_snapshot: jsonb`, `order_key: text`, `client_id: uuid` obligatorio |

El esquema SQL versionado guarda los datos del cliente dentro de JSONB, no en columnas obligatorias separadas para cédula/correo. El cambio usa `state.facturacionElectronica` y `order_snapshot.facturacionElectronica`; conserva `customer` y sus claves existentes, con cédula/correo null cuando no se aportaron. Estados antiguos sin la bandera se hidratan como normales; no se infiere electrónica por sus datos fiscales.

Las pruebas ejecutan el repositorio y store reales con `fetch` simulado: serializan e hidratan ambos escenarios después de recrear el módulo, verifican el snapshot, el índice de conflicto `client_id,channel_user_id,order_key`, repetición sin duplicar y aislamiento por empresa. La prueba de ráfagas ejecuta el coordinador real con transporte y reloj simulados.

No se requiere migración según el esquema versionado y los tipos reales consultados. No se hicieron INSERT/UPDATE reales: la escritura productiva, los triggers y las restricciones no expuestas por OpenAPI no se validaron mediante transacciones reales.

## Pruebas y preservación

| Comprobación | Resultado |
|---|---|
| Baseline `npm test` antes de modificar | 921/921, 0 fallos, 6.958 s |
| Suite final `npm test` | 941/941, 0 fallos, 6.994 s |
| Casos nuevos de variantes | 19/19 |
| `git diff --check` | Sin errores |
| Diff protegido | Sin cambios en modelRouter, multimedia, scheduler/buffer, handoff, validador/búsqueda/repositorio de productos, proveedor, SQL, productos.json ni dependencias |

Se mantienen las regresiones de cotización/carrito, producto, multimodalidad, concurrencia, idempotencia y handoff. Las expectativas antiguas que exigían datos fiscales por defecto se adaptaron a la nueva regla o se convirtieron explícitamente en casos de electrónica. Los fixtures de cierre que usaban teléfonos `0000` o nombres incompletos se sustituyeron por datos sintéticos válidos para seguir probando cierre exitoso. No se relajaron límites de contexto ni se retiraron comprobaciones de carrito o persistencia.

Las pruebas no invocan modelos de pago ni envían mensajes. La interpretación de lenguaje libre se prueba con doubles semánticos y parsers locales; falta una validación conversacional con el modelo y canal de staging antes de desplegar. El comportamiento existente de recogida en sede se conserva; este cambio concentra las variantes en el cierre con datos de domicilio.

## Estado de entrega

Código local probado, sin commit/push/deploy/restart. No hay acciones denegadas o pendientes de ejecución. La primera lectura de esquema tuvo ENOTFOUND dentro del sandbox; el GET autorizado fuera del sandbox terminó correctamente. Para activar el cambio en producción aún hace falta el procedimiento de despliegue autorizado.
