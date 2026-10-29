# Identificación comercial y continuidad de referencias

Cierre local, 28 de octubre de 2026. Se implementó la mejora general sobre la arquitectura existente y se conservaron los trabajos anteriores de checkout y continuidad comercial durante una consulta clínica pendiente. No se reinició, desplegó ni modificó el servidor en ejecución. No se enviaron mensajes ni se hicieron llamadas pagadas a OpenAI.

## 1. Problema real y causa comprobada

Este incidente es distinto del silencio anterior por pausa clínica: aquí el agente **sí respondió**, pero derivó una aclaración comercial que podía continuar.

| UTC, 28 octubre | Evidencia |
| --- | --- |
| 21:51:41 | Kapso recibió la consulta por Pro Plan UR. |
| 21:51:46–48 | Entrega webhook `delivered`, HTTP 200. |
| 21:52:06 | Estado: marca PRO PLAN, referencia UR, especie desconocida; pregunta pendiente por especie. Ya había candidatos CANINE UR, FELINE UR y sus variantes en lata. |
| 21:52:09 | Kapso registró enviada la pregunta perro/gato. |
| 21:57:46 | Kapso recibió «Para perrito». |
| 21:57:52–55 | Webhook `e3c03792-2ac1-4387-945e-73d43fa32730`, entregado con HTTP 200. |
| 21:57:54.951 | Entrada almacenada en Supabase. La interpretación persistida contiene PRO PLAN, CANINE UR, especie perro. |
| 21:58:12–14 | Se guardó `pendiente_asesor`, motivo `producto_no_resuelto`, segundo intento de aclaración. Kapso registró la respuesta de derivación como `sent`; Supabase también la guardó. |

Fuentes: [estado y mensajes](evidence.json), [entregas webhook](delivery-evidence.json). El catálogo leído durante la investigación contiene **388 marcas y 1.063 referencias**. PRO PLAN CANINE UR existe, especie perro, **2 kg, $122.000**. También existe PRO PLAN CANINE LATA UR, **unidad, $28.600**. Stock es `null` en ambas: no se presenta como disponibilidad confirmada.

El código anterior exigía igualdad literal de los tokens de la identidad pendiente y la interpretación actual. `UR` y `CANINE UR` no pasaban esa comparación. «Perrito» tampoco completaba la alternativa léxica de especie. Se perdía la consulta contextual y la validación trataba la respuesta breve como una consulta aislada. El control de aclaraciones convertía ese resultado en derivación. La interpretación semántica y los candidatos ya contenían la información correcta.

El [replay del motor anterior](before-multiturn.txt) reproduce la derivación en el segundo turno. Usa el catálogo real y decisiones estructuradas reconstruidas a partir de la interpretación guardada. Los campos completos de confianza/seguimiento no estaban en ese registro y se simulan explícitamente; no se afirma disponer del JSON crudo de OpenAI ni del SQL histórico exacto del turno.

Durante la continuación apareció otro defecto: después de validar un atributo aclarado, el motor comercial podía recibir nuevamente la frase breve original y ofrecer opciones genéricas. Ahora recibe la identidad respaldada para las aclaraciones de atributos; las confirmaciones de carrito conservan su significado operativo.

Hay evidencia de recepción, persistencia, interpretación y envío. No hay evidencia de un mensaje perdido en Kapso o webhook. El archivo local de log revisado estaba vacío y no había sesión de terminal adjunta accesible: no se atribuye una excepción a OpenAI/Supabase sin evidencia. El contenido exacto de los módulos cargados en el proceso histórico tampoco puede certificarse únicamente con los archivos en disco.

## 2. Representación, recuperación y validador

Se mantiene **Router → Supabase FTS → candidatos → validador → motor de consulta/carrito**.

`productRequestContext.js` proyecta marca, línea, referencia, especie, categoría, etapa, tamaño, presentación, cantidad, duración, sabores y condiciones. Los atributos desconocidos permanecen en `null`. El repositorio también deja de convertir una especie ausente del catálogo en perro.

`catalogRecoveryPlan.js` ejecuta progresivamente:

1. Consulta literal normalizada contra el RPC existente, que ya pondera nombre, FTS y similitud.
2. Atributos estructurados, si generan una consulta diferente. Ayudan a recuperar candidatos, pero no sustituyen la evidencia usada al validar.
3. Expansión lingüística existente, singularización, identidad parcial y variaciones de segmentación. La recuperación de errores de marca compara nombres reales del mismo tenant.
4. Evaluación tras cada respuesta. Una coincidencia confirmada o una pregunta útil por un atributo faltante detiene las consultas adicionales.

Se deduplican consultas. Los productos repetidos de un turno comparten recuperación sin desalinear sus posiciones. No se crea una caché global entre tenants o conversaciones.

**Límites:** seis búsquedas planificadas por producto y 4.000 ms por defecto, configurables con `CATALOG_RECOVERY_TIMEOUT_MS`, con techo de 10.000 ms. Hasta 20 candidatos por consulta; el límite final del contexto existente se conserva. Los reintentos de transporte y la recuperación aproximada de marca pueden añadir solicitudes HTTP dentro del mismo presupuesto: seis búsquedas no equivale necesariamente a seis solicitudes HTTP. Los turnos con varios productos mantienen la concurrencia existente y tienen presupuesto por producto.

La cancelación llega a Supabase y no inicia nuevos reintentos cuando la señal está abortada. Un fallo parcial sin identidad suficiente es incertidumbre técnica, no prueba de inexistencia ni ocasión para aprender una asociación.

El validador existente conserva las restricciones de marca, línea/código, especie, formato, presentación y atributos. La recuperación registra `confirmada`, `probable` o `sin_coincidencia_confiable`. Los candidatos incompatibles se descartan mediante los filtros existentes del validador; la clasificación no añade un segundo motor de selección. La selección final se valida nuevamente sobre la identidad respaldada, nunca sobre una referencia sugerida únicamente por una búsqueda alternativa.

En la regresión obligatoria, «Pro Plan UR» → «Para perrito» recupera las dos variantes caninas válidas. Falta elegir concentrado o lata, por lo que se pregunta por esa diferencia. Al aclarar «el concentrado», se valida CANINE UR y se cotizan 2 kg a $122.000 sin modificar el carrito. Un nombre completo explícito puede resolverse directamente. Recuperar la referencia no autoriza a seleccionar una presentación arbitraria.

## 3. Memoria contextual y recuperación antes de derivar

El router existente interpreta la relación entre el turno y la pregunta activa: `nueva`, `aclaracion` o `sin_resolver`. Se reforzaron sus instrucciones generales sobre respuestas breves, correcciones, negaciones y atributos desconocidos. No se añadió otro modelo ni un clasificador de frases.

La continuidad usa la solicitud pendiente y su TTL existente de 30 minutos. Compara la identidad separando los atributos que se están aclarando: una especie traducida dentro del nombre no cambia el código comercial. Conserva marca, línea y referencia originales y completa los campos de la pregunta activa. Se amplió la continuidad a marca, referencia, línea, cantidad y condiciones, además de especie, tamaño, sabor y presentación.

Los atributos pendientes se respaldan contra la evidencia del intento anterior; una conjetura no se convierte en hecho persistido. Las identidades ya validadas mantienen su condición de cotización. Una consulta nueva parte sin arrastrar atributos del producto anterior o del carrito. Antes de una derivación `sin_resolver`, se comprueba si el turno completa un atributo.

La persistencia utiliza `state.ultimaConsultaProducto.solicitudOriginal` y los campos JSON actuales. No hay almacén paralelo ni migración. El repositorio existente conserva el aislamiento por cliente/conversación. El buffer no se modificó para esta mejora.

## 4. Equivalencias escalables, historial y búsqueda híbrida

Se reutilizan vocabulario de atributos, códigos declarados, aliases y nombres existentes, normalización de unidades e interpretación contextual. No se añadieron reglas por Pro Plan, UR ni otra referencia. Los nuevos ejemplos comerciales están en fixtures y evaluación. Las reglas léxicas previas del proyecto permanecen; la mejora no depende de añadir nuevas excepciones de producto.

La búsqueda de evidencias históricas verificadas existente continúa como lectura opcional. No se activó `PRODUCT_IDENTITY_EVIDENCE_ENABLED`, no se aprobaron asociaciones automáticamente ni se aprendió de un simple «sí». Se mantienen los controles administrativos de aprobación, conflictos, caducidad y cambios de catálogo. Esa vía permite reutilizar resoluciones revisadas sin alterar el catálogo original.

No se añadieron embeddings. La muestra posterior recupera el objetivo en 206/206 casos y las ambigüedades restantes necesitan datos del cliente. No hay evidencia medida de una ventaja que justifique otro servicio, coste y latencia. **No se ejecutó una comparación contra un modelo de embeddings**, por lo que tampoco se afirma superioridad universal de FTS. Una evaluación vectorial futura requeriría un conjunto donde aporte beneficio demostrado antes de implementarse.

## 5. Pruebas y resultados comparativos

Baseline previo: **973/973**. Suite completa final: **994/994**, sin fallos, cancelaciones u omisiones, duración 6.883,9 ms. Terminó a las **22:31:38 UTC**. Tras reconectar se confirmó que ningún archivo de código era posterior a ese resultado: el último cambio de código fue a las 22:31:12 UTC. Se revisó el diff y no se encontraron cambios concurrentes posteriores. No fue necesario repetir la suite.

Se añadieron **21 pruebas** específicas. Se actualizó una expectativa anterior que exigía consultar sinónimos aunque la consulta literal ya resolviera el producto. `git diff --check` pasó.

Evaluación offline: muestra determinista de **97 referencias reales**, probadas con nombre exacto y presentación (194 casos), más **12 continuaciones de cuatro familias comerciales**, total 206. Recuperación local y validador son reales; las decisiones semánticas son fixtures, no respuestas nuevas de OpenAI.

| Métrica | Antes | Después |
| --- | ---: | ---: |
| Candidato objetivo recuperado / 206 | 199 | 206 |
| Selecciones finales correctas / 206 | 186 | 188 |
| Selecciones finales incorrectas / selecciones realizadas | 0/186 | 0/188 |
| Casos con aclaración útil / 206 | 11 | 16 |
| Continuaciones conservadas / 12 | 5 | 12 |
| Objetivo recuperado en continuaciones / 12 | 5 | 12 |
| Selección correcta en continuaciones / 12 | 1 | 3 |
| Aclaración útil en continuaciones / 12 | 4 | 9 |

Dos casos permanecen inciertos; no se convierten en selecciones forzadas. El 100% de precisión observado entre las selecciones realizadas no garantiza precisión universal sobre el catálogo ni sobre futuras salidas del modelo. Recuperación, selección y aclaración se miden por separado.

En el replay completo del incidente, la derivación innecesaria pasa de una a cero. No se estima una tasa global de derivación usando únicamente pruebas unitarias. El replay conserva el carrito previo de gato y arena y verifica que reentregar un ID ya procesado no genera otra respuesta.

Cobertura específica: identidad completada entre turnos, nuevos productos, marcas/códigos incompatibles, negación/corrección de especie, campos desconocidos, sabores, tamaños, pesos, cantidades, TTL, recarga de estado, entradas multimedia mediante adaptador simulado, deduplicación multiproducto, cancelación de proveedor detenido, recuperación tras fallo y replay de RPC reales sin red.

La suite existente incluye buffer, ráfagas, eventos durante procesamiento, errores de proveedores, deduplicación, aislamiento, handoff activo, carrito, pedidos y facturación normal/electrónica. Los fixtures multimedia comprueban el paso a la lógica común; no validan el reconocimiento real de voz o imagen. No se hicieron pedidos ni escrituras productivas de prueba.

Evidencias: [tests.before.txt](tests.before.txt), [tests.after.txt](tests.after.txt), [before.json](before.json), [after.json](after.json), [before-multiturn.txt](before-multiturn.txt).

## 6. Latencia real y cambios en Supabase

Se realizaron dos series de lecturas reales durante el tramo anterior: ocho consultas, dos rondas por versión, alternando antes/después; **16 ejecuciones por versión y serie**. Las respuestas RPC se guardaron para reproducir resultados offline. La selección/aclaración final se mantuvo en las ocho consultas, incluidas erratas, producto inexistente y familia UR.

| Medida | Primera serie antes/después | Serie final antes/después |
| --- | --- | --- |
| Búsquedas al repositorio | 46 / 24 | 46 / 24 |
| Mediana | 632 / 475 ms | 812 / 581 ms |
| P95 empírico, máximo con n=16 | 1.387 / 1.516 ms | 21.215 / 2.111 ms |

La primera serie muestra que la cola lenta puede empeorar por recuperación secuencial sin resolución temprana. La segunda presenta un valor atípico de red/reintentos en la versión previa; no se atribuye toda esa diferencia al algoritmo. El resultado estable es **47,8% menos búsquedas**, con mediana menor en ambas series. Son tiempos de recuperación, no latencia completa de WhatsApp/OpenAI. El presupuesto limita recuperación, no generación, envío o todo el turno.

El detalle conservado de la serie final está en [live-retrieval.json](live-retrieval.json); [rpc-replay.json](rpc-replay.json) contiene respuestas para pruebas offline. Los valores de la primera serie fueron observados en la salida de la herramienta; la segunda ejecución reemplazó el archivo detallado, por lo que no se presenta la primera como una segunda traza completa conservada.

En la evaluación offline, P50 pasó de 40,8 a 39,2 ms y P95 de 77,5 a 74,1 ms. Son mediciones locales de la muestra, independientes de la red y del modelo.

**Supabase: ninguna escritura, cambio SQL, índice, precio, alias o estructura aplicada.** Solo se leyó catálogo, historial y estado. Se mantiene la compatibilidad del JSON actual; no hace falta migración. No hubo llamadas a servicios reales después de la reconexión para este cierre.

## 7. Archivos modificados y restricciones preservadas

| Archivo | Cambio de esta mejora |
| --- | --- |
| `src/services/productRequestContext.js` | Proyección, respaldo de evidencia y comparación de identidad durante aclaraciones. |
| `src/services/catalogRecoveryPlan.js` | Plan progresivo, evaluación y presupuesto con cancelación. |
| `src/services/conversationService.js` | Continuidad, persistencia de solicitud respaldada y entrega de identidad al motor. |
| `src/services/catalogContextService.js` | Recuperación progresiva, deduplicación y telemetría de intentos. |
| `src/services/productMatchValidator.js` | Expone normalización de atributos existente para reutilizarla. |
| `src/services/aiContextOptimizer.js` | Instrucciones generales de aclaración y cambios de producto. |
| `src/repositories/productRepository.js` | Especie desconocida, señal de cancelación y evita lectura de marcas si ya hay marca exacta. |
| `src/repositories/supabaseClient.js` | No reintenta solicitudes canceladas. |
| `test/productRecoveryContext.test.js` | 21 regresiones específicas. |
| `test/catalogRetrievalRegression.test.js` | Expectativa de detención temprana con resultado válido. |
| `scripts/evaluation/product-context.js`, `scripts/evaluation/retrieval-live.js` | Evaluaciones reproducibles. |

Otros archivos modificados del árbol pertenecen al trabajo previo y se conservaron. El diff de esta mejora no cambia la selección de modelos. No se editó `.env`, catálogo, esquema SQL ni reglas de buffer, carrito, checkout o facturación. La integración con el motor comercial cambió únicamente para suministrarle la identidad contextual ya validada. Las pruebas de esas funciones siguen aprobadas.

Riesgos y mitigaciones: el router sigue siendo probabilístico, así que una propuesta no confirma identidad. Una red lenta puede terminar con incertidumbre técnica; no se informa falsamente inexistencia. TTL, intención nueva y atributos respaldados limitan contaminación contextual. Una coincidencia ambigua no se agrega por parecido. Los precios de los snapshots son evidencia de una lectura, nunca nuevas constantes productivas.

## 8. Estado de entrega y límites reales

**Código local y validación offline terminados; prueba real de WhatsApp pendiente.** La desconexión impidió inicialmente guardar este informe. Al reconectar se verificó la suite final y se completó la documentación. No quedan bloqueos de acceso para esta entrega.

No se reinició, desplegó, hizo push ni enviaron mensajes. No se realizó staging ni E2E real. La conversación productiva observada conserva `pendiente_asesor/producto_no_resuelto`: no se borró ni reabrió. Actualizar el proceso y reanudar esa conversación requerirían acciones autorizadas aparte; reiniciar solo no elimina la pausa persistida.

Prueba E2E propuesta, no ejecutada: actualizar el proceso con autorización, elegir una conversación Sandbox verificada y comprobar consulta UR, aclaración de especie y elección de concentrado, junto con carrito intacto y ausencia de derivación. No reenviar ciegamente mensajes históricos ni IDs ya procesados.

### Reproducción offline

```sh
npm test
node scripts/evaluation/product-context.js /tmp/product-context-after.json
PRODUCT_CONTEXT_BASELINE_FILE=docs/reports/product-context-2026-10-28/baseline/conversationService.txt node scripts/evaluation/product-context.js /tmp/product-context-before.json
PRODUCT_CONTEXT_BASELINE_FILE=docs/reports/product-context-2026-10-28/baseline/conversationService.txt node --test --test-name-pattern='real UR:' test/productRecoveryContext.test.js
```

La última orden debe fallar en el segundo turno: demuestra la regresión anterior. Los snapshots `.txt` son evidencia, no código cargado por el servidor. La evaluación de red exige `--live-read-only` y credenciales locales; no pertenece a `npm test` y no se ejecutó durante el cierre tras reconectar.
