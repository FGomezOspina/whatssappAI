# Ejemplos De Entrenamiento Conversacional

La tabla `training_examples` guarda ejemplos curados, no chats completos. Cada ejemplo debe explicar una situacion, el mensaje del cliente, la respuesta ideal y el criterio que el agente debe conservar.

Los ejemplos se inyectan como contexto dinamico. Pueden ser globales (`client_id` nulo) o propios de un cliente. No son fine-tuning y no reemplazan la validacion de catalogo.

## Principios

- Enseñar decisiones conversacionales, no excepciones de producto.
- No guardar precios o presentaciones como verdad permanente.
- No usar ejemplos como diccionario de aliases.
- Anonimizar datos personales antes de guardar.
- Mantener el backend como autoridad sobre catalogo, carrito y pedido.
- Usar `client_id` para criterios propios de una empresa; dejar global solo lo que aplique a toda la plataforma.

## Que Extraer De WhatsApp

- Respuestas humanas especialmente buenas.
- Casos donde el bot pregunto de mas.
- Nuevo pedido, repetir pedido, cambio de direccion, agregar o quitar productos.
- Varios mensajes cortos seguidos.
- Consultas de precio sin intencion de compra.
- Varios productos en un mensaje.
- Raza, abreviaturas o errores de escritura.
- Correccion de identificacion: `no, es...`.
- Seleccion de opcion mostrada previamente.
- Imagen con marca, linea, especie y peso.
- Audio o nota de voz con transcripcion util.

Antes de guardar, elimina cedulas, celulares, correos, direcciones exactas, comprobantes, imagenes privadas y audios originales.

## Carpeta Procesada

Los chats exportados se procesan con:

```bash
node scripts/generate-training-examples.js /Users/gomez/Downloads/Examples_chats data/training_examples
```

Ese comando genera:

- `data/training_examples/generated_training_examples.sql`
- `data/training_examples/generated_training_examples.json`
- `data/training_examples/observed_terms.json`
- `data/training_examples/summary.json`

Revisa y anonimiza antes de subir a Supabase.

## Formato Recomendado

`intent`: nombre corto de la situacion.

`customer_message`: mensaje o mini contexto.

```text
Cliente ya tenia un pedido confirmado. Agente pregunta si desea repetirlo.
Cliente responde: para un dog chow a.rp 4kg
```

`ideal_response`: criterio de respuesta ideal.

```text
Agregar Dog Chow Adulto Mini y Pequeno 4kg al pedido nuevo. No sumar el pedido anterior ni pedir presentacion otra vez. Luego confirmar si usa la misma direccion.
```

`notes`: regla breve para que la IA entienda el criterio.

`tags`: palabras clave como `nuevo pedido`, `direccion`, `no preguntar de mas`.

`priority`: 0 a 100. Usa 100 para criterios criticos.

## Criterios A Reforzar

- Preguntar precio no significa comprar.
- Una negativa por presentacion inexistente es valida.
- Si el cliente envia dos productos, conservar cada item por separado.
- Si dice `asi esta bien`, avanzar sin repetir informacion resuelta.
- Una raza describe a la mascota; no es una marca desconocida.
- Si aclara `de 4kl`, completar la pregunta pendiente.
- Si una imagen no es legible, pedir solo el dato faltante.
- Si una imagen tiene variante critica visible, conservarla.
- Si el audio ya llega transcrito desde Kapso, razonar sobre la transcripcion.
- Si el cliente corrige el producto, descartar la hipotesis anterior y validar de nuevo.

## Que No Guardar

- Chats completos.
- Mapeos manuales de una referencia a otra.
- Listas de aliases que pertenecen al catalogo.
- Precios o presentaciones cambiantes.
- Respuestas literales obligatorias.
- Datos personales reales.
- API keys o secretos.

## Ejemplo SQL

```sql
insert into public.training_examples
  (client_id, intent, customer_message, ideal_response, notes, tags, priority)
select
  id,
  'nuevo_pedido_producto_exacto',
  'Cliente quiere hacer otro pedido y responde: para un dog chow a.rp 4kg',
  'Agregar ese producto exacto al pedido nuevo y preguntar si se envia a la misma direccion. No pedir presentacion porque ya dijo 4kg.',
  'Cuando hay marca, referencia y presentacion exacta, avanzar sin preguntar de mas.',
  array['nuevo pedido', 'producto exacto', 'directo'],
  100
from public.aivance_clients
where slug = 'distrifinca';
```

## Aprendizaje supervisado desde conversaciones

Al finalizar un turno persistido se capturan solicitudes múltiples, productos pendientes y correcciones detectadas. Se guardan como `active=false` con etiquetas `learning:v1` y `learning:pending`, dentro de la empresa correspondiente. No se copian respuestas del agente, precios, carrito ni el chat completo. El resumen de productos se filtra para retirar contactos y datos de entrega conocidos; la revisión humana debe comprobar también la anonimización antes de aprobar.

La captura es idempotente por empresa y turno: un reintento no sobrescribe una revisión. Si falla Supabase, se conserva la respuesta y el pedido. La captura tiene un tiempo de espera acotado. No hay entrenamiento automático del modelo ni aprobación automática de sus respuestas.

Revisar candidatos de una empresa (usar su UUID de `aivance_clients`):

```bash
node scripts/review-learning.js list CLIENT_UUID pending
```

Crear un JSON de revisión con un ejemplo anónimo y el criterio correcto, sin precios ni instrucciones de catálogo permanentes:

```json
{
  "customer_message": "Cliente pide tres latas de un producto identificado en el catálogo.",
  "ideal_response": "Conservar tres unidades. Distinguir el envase del contenido; validar la referencia y las presentaciones actuales antes de cotizar.",
  "notes": "No confundir cantidad de envases con peso ni interpretar un envase ausente del nombre como incompatibilidad.",
  "reviewed_by": "operador"
}
```

```bash
node scripts/review-learning.js approve CLIENT_UUID EXAMPLE_UUID revision.json
node scripts/review-learning.js list CLIENT_UUID approved
```

Rechazar un candidato o retirar un ejemplo aprobado utiliza un JSON con `{"reason":"Motivo de revisión"}`:

```bash
node scripts/review-learning.js reject CLIENT_UUID EXAMPLE_UUID motivo.json
node scripts/review-learning.js revoke CLIENT_UUID EXAMPLE_UUID motivo.json
```

Las revisiones se limitan a la empresa y detectan cambios simultáneos. Solo ejemplos aprobados, activos y relevantes se recuperan; no se reutilizan datos entre empresas. La recuperación compara palabras entre el mensaje y los ejemplos, sobre una ventana de los 100 aprobados más recientes, además de los ejemplos curados existentes. La revocación se aplica en la siguiente recuperación, sin reiniciar.

Para desactivar solo la captura: `LEARNING_CAPTURE_ENABLED=false`. Para desactivar solo el uso de ejemplos aprendidos: `LEARNING_RETRIEVAL_ENABLED=false`. Reiniciar el servidor al cambiar variables de entorno. Los ejemplos curados anteriores continúan funcionando.

No se necesita una migración nueva si ya existen `training_examples`, su columna `client_id` y el trigger de `updated_at` de las migraciones del proyecto. La herramienta es administrativa por terminal; no expone un endpoint de aprobación a los clientes de WhatsApp.
