# Diagnóstico de reconocimiento — 9 de octubre de 2026

Se añadieron trazas y un ejecutor de diagnóstico. No se cambió la lógica de reconocimiento, búsqueda, matching, buffer ni carrito durante esta investigación. Las modificaciones funcionales anteriores del workspace se conservaron.

## Método y límites

- Visión real de OpenAI y búsqueda real, de solo lectura, en el catálogo de Supabase del cliente configurado.
- Recortes de los dos productos tomados de las capturas aportadas. Se reutilizaron exactamente los mismos bytes, comprobados por hash. No se dispone de los archivos originales descargados por WhatsApp ni de las trazas de las ejecuciones históricas de las capturas.
- Estado e historial simulados localmente; se marca la respuesta como entregada para no introducir cotizaciones artificialmente pendientes. No se envió WhatsApp ni se guardaron pedidos/conversaciones en producción.
- Se usa la respuesta operativa, sin redactor final. La prueba aísla reconocimiento, recuperación y matching; no reproduce la redacción libre ni el transporte de WhatsApp.
- Una primera pasada del ejecutor no marcaba las cotizaciones como respondidas. Se corrigió únicamente el simulador y se repitió la matriz. Los resultados publicados aquí corresponden a esa repetición.

## Resultados reales

| Caso | Resultado |
|---|---|
| Imagen sola, estado limpio, intento 1 | Identifica Max Cat y ofrece 1, 3 y 10.1 kg. |
| Misma imagen y texto, estado limpio, intento 2 | Mismo resultado comercial. |
| Dos imágenes juntas | Identifica ambas; cotiza King Cat 25 kg y pregunta el peso de Max Cat con sus opciones. |
| Reenviar la primera después de ambas | Identifica Max Cat; no pierde la referencia. |
| Misma imagen con «Max cat 10kg» | Visión identifica Max Cat; búsqueda devuelve la referencia correcta; match final baja y respuesta «No encuentro … de 10kg». |
| Reenviar después del caso anterior | La revisión reconoce Max Cat con confianza 0.99, hereda 10 kg del contexto y la combinación añade también un producto vacío. Respuesta operativa defectuosa: «: no pude procesar esta solicitud por un problema temporal.» |

Evidencia: [matriz](real-matrix.json), [peso y contexto](real-weight-context.json), [comparación controlada del matching](matching-probe.json).

## Causas localizadas

### 1. El peso invalida la identidad antes de resolver la equivalencia

En `productMatchValidator.js`, `ajustarPorSenales()` resta 0.28 al score visual cuando no hay una presentación exacta. La clasificación de confianza ocurre antes de la equivalencia de pesos. Esta última construye `coincidenciaValidada` solamente cuando `nivel === 'alta'`.

Por tanto, 10 kg puede bajar la confianza de una referencia que sí tiene 10.1 kg y cerrar el paso a la equivalencia que debería resolverlo. La búsqueda real devolvió `MAX CAT ADUL FRANGO` con 1, 3 y 10.1 kg: no faltó el producto en los candidatos.

En la comparación controlada con los mismos candidatos, `MAX CAT FRANGO ARROZ ADULTO` en modo visión obtuvo score 1 sin peso, 0.668 con 10 kg (baja) y 0.94 con 10.1 kg (alta). Con el texto adicional «Professional Line», 10 kg bajó a 0.57. En modo texto, la misma identidad con 10 kg alcanzó alta. Eso explica por qué algunas pruebas de texto pasaban y el caso visual seguía fallando.

### 2. Contexto previo cambia el significado de reenviar la misma foto

En `reenviada-tras-peso`, el primer router devolvió un producto vacío. La revisión individual reconoció la identidad, pero devolvió `solicitud.presentacionContexto = '10kg'` y `contextoVigente = true`. La evidencia visible seguía sin peso. `resolverEvidenciaInterpretacion()` conserva el peso contextual, que vuelve a activar el fallo anterior.

La misma foto no constituye la misma entrada del modelo si cambian estado, historial y pregunta anterior. La variación observada no demuestra corrupción de bytes ni pérdida por el buffer.

### 3. Un objeto vacío se conserva como producto al combinar lecturas

En `conversationService.js`, la normalización deja un objeto `producto` con campos null. `originales` lo acepta mediante `filter(Boolean)`. `previos` conserva entradas sin tokens porque encuentran cero coincidencias, y `unicos` lo agrega al producto reconocido. Esto convierte una imagen en dos solicitudes: una vacía y la real. Se reprodujo en las trazas de `productos_combinados`.

También se observó un error de conexión en una revisión individual de la primera pasada real. El código convierte tanto fallos técnicos como falta de identidad en `_imagenSinLectura`. Por eso el aviso al cliente no distingue «falló una llamada» de «la foto es ilegible». No se puede atribuir el aviso histórico concreto a una de estas causas sin su traza.

## Variación, modelos y concurrencia

El router/revisor utiliza gpt-5.4; el mapeo visual posterior utiliza gpt-4.1 en esta configuración. Las repeticiones limpias variaron en campos/confianza pero conservaron la identidad. El cambio de contexto sí alteró la decisión del router. En las pruebas documentadas no hubo pérdida de bytes ni sustitución de una imagen por otra.

Las 52 pruebas focalizadas de buffer, coordinador y pipeline multimodal pasaron, incluidos 10 mensajes y llegadas durante visión. Repetir 20 veces el mismo matching produjo un solo resultado y no mutó su entrada. No se encontró evidencia de una carrera como causa de este caso; estas pruebas no descartan todas las carreras posibles en producción.

La suite completa tuvo 4 fallos de catálogo (tres de Diamond/libra y uno de FELIX/húmedo), ajenos a la matriz real aquí descrita. Se detectaron cambios adicionales en `productos.json` durante la revisión; no se editaron ni revirtieron desde este diagnóstico. No se declara la suite global aprobada.

## Cambio mínimo recomendado, todavía no aplicado

1. Validar primero la identidad comercial sin dejar que un peso aproximado la rebaje a «producto inexistente». Resolver después el tamaño exacto/equivalente entre las presentaciones de esa identidad, conservando el peso solicitado y mostrando el real.
2. Al combinar lecturas, excluir objetos sin identidad/evidencia y diferenciar error técnico de lectura vacía. Conservar una lectura válida del mismo archivo si falla una revisión secundaria.

No recomiendo añadir aliases, bajar globalmente umbrales ni aumentar nuevamente el debounce. Cambiar de modelo tampoco corrige por sí solo los dos errores deterministas.

## Uso de las trazas temporales

`PRODUCT_RECOGNITION_TRACE=true npm start` habilita `vision_output`, `producto_interpretado`, `productos_combinados`, `busqueda_candidatos`, `matching_filtros`, `match_final` y `vision_error`. Incluyen ejecución, modelo y hashes de imagen/contexto; no añaden base64, URLs firmadas ni datos de entrega/pago. Están desactivadas por defecto.

Ejecutor de solo lectura: `node scripts/audit-image-recognition.js primera.png segunda.png informe.json`. `AUDIT_CASE_FILTER=peso` limita la ejecución a los dos casos con peso/contexto.
