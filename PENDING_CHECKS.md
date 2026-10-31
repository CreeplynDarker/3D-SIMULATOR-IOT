# Verificaciones humanas pendientes

Estas son las 17 verificaciones `[human]` que las pruebas automáticas no pueden firmar. Vienen de la sección
"Waiting for human review" de `docs/PROGRESS.md`. Cuando una persona complete una, debe marcar su casilla aquí, anotar
su nombre, la fecha y el resultado, y mover la línea correspondiente de `docs/PROGRESS.md` a una nota de cierre.

- **Verificaciones 1 a 13:** se pueden hacer ya, sin hardware.
- **Verificación 14:** se puede hacer ya con el ESP32 emulado.
- **Verificaciones 15 a 17:** necesitan la placa real con el firmware.

## Preparación común

Sitio publicado (no requiere instalar nada): https://creeplyndarker.github.io/3D-SIMULATOR-IOT/

Para trabajar en local (Node 22 y pnpm 10):

```bash
git clone https://github.com/CreeplynDarker/3D-SIMULATOR-IOT.git
```

```bash
cd 3D-SIMULATOR-IOT
```

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm build
```

```bash
pnpm preview
```

`pnpm preview` sirve la versión compilada en http://localhost:4173. Para pruebas de rendimiento, usar siempre esta
versión o el sitio publicado, nunca `pnpm dev`.

Atajos útiles dentro de la app:

| Tecla   | Acción               |
| ------- | -------------------- |
| Espacio | Reproducir / pausar  |
| S       | START                |
| E       | E-STOP               |
| R       | RESET                |
| 1 a 5   | Cámaras predefinidas |
| `?`     | Leyenda y ayuda      |

Si se añade `?debug=1` a la URL, la consola del navegador expone `window.__sim` (fps, estado, tiempo) y
`window.__pdm` (inspección del estado), útiles para medir.

---

## A. Aspecto y disposición de la escena

### 1. P1.2 · Cada pieza se reconoce junto a su foto

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que cada componente 3D se parece a la pieza real del banco.

**Archivos:** `assets/photos/` contiene `fan.jpg`, `fan-closeup.png`, `esp32.jpg`, `relay.jpg`, `relay-closeup.png`,
`acs712.jpg`, `ds18b20.jpg`, `breadboard.jpg` y `adapter.jpg`. La geometría de cada pieza está descrita en
`docs/PLAN.md` §13.2 y se construye en `src/scene/models/`.

**Cómo hacerlo:**

1. Abrir la app.
2. Hacer clic en cada pieza (ventilador, ESP32, relé, ACS712, DS18B20, protoboard, adaptador). El Inspector (M9)
   muestra la foto de esa pieza junto a sus datos.
3. Usar las cámaras `cam-fan`, `cam-esp32`, `cam-relay` y `cam-breadboard` (teclas 1 a 5) para verlas de cerca.
4. Para cada pieza, comparar forma, proporciones, colores, rótulos, número y posición de pines y color de cables con
   la foto.

**Aprobado si** alguien del equipo puede nombrar cada pieza mirando solo el modelo 3D, y ningún detalle visible
(color del PCB, posición del conector, número de pines) contradice la foto. Anotar cualquier diferencia como issue
con el nombre de la pieza.

### 2. P1.3 · La disposición parece un banco de laboratorio ordenado

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** la impresión general de la escena.

**Cómo hacerlo:**

1. Abrir la app con la cámara `cam-overview` (tecla 1).
2. Girar la cámara alrededor de la mesa con el ratón y comparar con el banco real del grupo (o con su foto, si
   existe).
3. Comprobar que las piezas están alineadas, separadas de forma razonable y apoyadas sobre la mesa (nada flotando ni
   hundido), que los cables siguen recorridos plausibles y que la escala de cada pieza es coherente con las demás.

**Aprobado si** la escena se reconoce como el banco del grupo y no hay piezas mal escaladas, flotando o
superpuestas.

### 3. P1.4 · Ningún cable atraviesa un componente

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que los cables rodean las piezas en lugar de atravesarlas. Hay una prueba automática que lo
cubre en parte, pero se pide una revisión visual.

**Prueba automática que lo cubre en parte:**

```bash
pnpm vitest run tests/unit/scene/route.test.ts
```

**Archivos:** recorridos de cables en `src/shared/wiring.ts` (tabla de `docs/PLAN.md` §13.3).

**Cómo hacerlo:**

1. Activar el conmutador **Labels** (`tgl-labels`) para ver el nombre de cada cable.
2. Recorrer la escena desde varios ángulos, especialmente alrededor de la protoboard, el ESP32 y el relé.
3. Acercar la cámara a cada cruce entre un cable y una pieza.

**Aprobado si** ningún cable entra en el volumen de una pieza (salvo en su pin de destino). Anotar el ID del cable
(por ejemplo `W04`) si alguno lo hace.

### 4. P5.1 · La interfaz se lee bien a 1280 × 720 y a 1920 × 1080

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** la legibilidad y el orden de la interfaz en las dos resoluciones objetivo.

**Archivos de referencia:** `docs/screenshots/p5/`, con capturas en los estados OFF, NORMAL, WARNING y CRITICAL a
ambas resoluciones (`off-1280x720.jpg`, `normal-1920x1080.jpg`, etc.).

**Cómo hacerlo:**

1. Revisar las 8 capturas.
2. Abrir la app en el navegador a cada resolución. En Chrome se puede usar DevTools → Toggle device toolbar
   (Ctrl+Shift+M) con tamaño 1280 × 720 y luego 1920 × 1080.
3. Llevar el sistema por OFF → NORMAL (START) → WARNING y CRITICAL (inyectar desequilibrio 0.3 en M4).
4. Comprobar que ningún texto se corta ni se superpone, que los botones se distinguen y que los estados se leen de un
   vistazo.
5. A 1280 × 720, comprobar que la columna izquierda (fallas y operador) se desplaza con la rueda del ratón y que se
   llega hasta el último control.

**Aprobado si** todo es legible sin hacer zoom a ambas resoluciones y la columna izquierda se desplaza a 720 px.

---

## B. Comprensión y contenido

### 5. P5.G · Un compañero provoca una falla y hace un reset sin instrucciones

- [ ] Hecho · Responsable: ____ · Participante: ____ · Fecha: ____ · Tiempo: ____ · Resultado: ____

**Qué se comprueba:** que la interfaz se entiende sin ayuda.

**Cómo hacerlo:**

1. Elegir a un compañero que no haya usado la app.
2. Darle solo la URL del sitio publicado y esta consigna: _"Arranca el ventilador, provoca un desequilibrio hasta que
   el sistema corte la alimentación y luego deja el sistema otra vez apagado y listo."_
3. No responder preguntas ni señalar controles. Observar y anotar dónde duda o se equivoca.
4. Detenerse cuando el sistema vuelva a OFF tras el RESET confirmado, o a los 10 minutos.

**Aprobado si** completa START → falla → CRITICAL → RESET → OFF sin ayuda. Cada duda anotada es una mejora posible
de la interfaz, aunque la verificación se apruebe.

### 6. P6 · Las animaciones muestran causa y efecto a quien no leyó el informe

- [ ] Hecho · Responsable: ____ · Participante: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que las animaciones explican por sí solas qué pasa en el banco.

**Archivos de referencia:** `docs/screenshots/p6/`, con los 6 pasos del escenario guiado S2 (`s2-step1-t7.6s.jpg` a
`s2-step6-t120.0s.jpg`).

**Cómo hacerlo:**

1. Con alguien que no haya leído el informe, abrir la app y elegir **Scenario → S2 imbalance** en la barra superior.
   Se abre la tarjeta guiada (M11), que avanza sola.
2. Pausar en cada paso y pedirle que explique con sus palabras qué está pasando y por qué. Por ejemplo: "el
   ventilador vibra más", "el puntaje del modelo sube", "el relé se abre y el ventilador se frena".
3. Comparar sus respuestas con el texto de cada paso (`src/shared/guided.ts`).

**Aprobado si** identifica la cadena completa: desequilibrio → más vibración → puntaje alto del RCF → CRITICAL →
relé abierto → el ventilador se detiene.

### 7. P6.3/P6.4 · El clic del relé y el zumbido del ventilador suenan bien

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que los sonidos son creíbles y no molestan. Por defecto el sonido está silenciado.

**Cómo hacerlo:**

1. Usar auriculares o altavoces a volumen moderado.
2. Activar el conmutador **Sound** (`tgl-sound`) abajo a la derecha del visor.
3. Pulsar START: el relé debe hacer clic al cerrarse y el zumbido debe subir de tono al acelerar el ventilador.
4. Inyectar desequilibrio 0.3: el zumbido debe cambiar con la vibración.
5. Al llegar a CRITICAL, el relé debe hacer clic al abrirse y el zumbido debe bajar hasta apagarse.
6. Pausar (Espacio): el sonido debe callarse.
7. Si es posible, comparar con el sonido del ventilador y del relé reales.

**Aprobado si** los sonidos coinciden con los eventos y no hay chasquidos, cortes ni volumen excesivo.

### 8. P7.3 · Los textos de ayuda coinciden con el informe del proyecto

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que la terminología de la app coincide con la del informe. Solo se pudo revisar contra
`docs/PLAN.md` §14 porque el informe no está en el repositorio.

**Archivos a revisar:**

| Archivo                    | Contenido                                                                        |
| -------------------------- | -------------------------------------------------------------------------------- |
| `src/ui/legend.ts`         | Glosario, colores de cables y de estados, atajos (lo que muestra la leyenda M12) |
| `src/shared/guided.ts`     | Texto de cada paso de los escenarios guiados (M11)                               |
| `src/shared/components.ts` | Nombres y especificaciones de cada pieza (Inspector M9)                          |
| `docs/PLAN.md` §14         | Glosario de referencia                                                           |

**Cómo hacerlo:**

1. Tener a mano el informe final del grupo.
2. Leer los archivos anteriores, o en la app: abrir la leyenda (`?`), pasar el ratón sobre las piezas y botones
   para ver los tooltips y recorrer los escenarios guiados S1, S2, S4, S5, S6 y S9.
3. Anotar cada término que difiera del informe (nombres de estados, variables como `a_rms_g` o `cf`, umbrales,
   nombres de componentes, unidades).

**Aprobado si** no hay contradicciones con el informe. Las diferencias de redacción se corrigen en los archivos
indicados. Los valores numéricos solo se cambian en `src/shared/config.ts`.

### 9. P3.7 · El C++ de referencia parece código Arduino plausible para ESP32

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Qué se comprueba:** que el código de `src/firmware/reference-cpp/` sirve como base realista del firmware real.

**Archivos:** `main.cpp` (lectura de sensores, ventana de 1 s, Wi-Fi/UDP), `state_machine.cpp`, `features.cpp`,
`relay.cpp`.

**Cómo hacerlo:**

1. Revisar que los pines coinciden con el cableado real:

   | Señal                        | Pin                                    |
   | ---------------------------- | -------------------------------------- |
   | MPU6050 (I²C, 400 kHz)       | SDA GPIO21, SCL GPIO22, dirección 0x68 |
   | DS18B20 (pull-up de 4.7 k)   | GPIO4                                  |
   | ACS712 (divisor 10 k / 20 k) | GPIO34 (ADC1)                          |
   | Tacómetro (pull-up de 10 k)  | GPIO27 (PCNT)                          |
   | Relé CH2                     | GPIO26 → IN2 (activo en bajo)          |

2. Revisar que las bibliotecas existen y son las habituales: `ArduinoJson`, `OneWire`, `DallasTemperature`, `Wire`,
   `WiFi`, `WiFiUdp`, `driver/pulse_cnt.h` (ESP-IDF 5 / núcleo Arduino-ESP32 3.x).
3. Intentar compilarlo en el Arduino IDE (o con `arduino-cli`) para la placa "ESP32 Dev Module", con las bibliotecas
   anteriores instaladas. Hay que definir antes `WIFI_SSID`, `WIFI_PASSWORD` y `LAPTOP_IP`.
4. Comprobar que los comentarios `// @map ...` aparecen en las mismas transiciones que en `src/firmware/*.ts`.

**Aprobado si** un miembro del equipo con experiencia en ESP32 lo considera razonable. Lo ideal es que compile; los
errores de compilación se anotan como issues.

---

## C. Rendimiento y demostración

### 10. P1.6 · Al menos 50 fps a 1920 × 1080 en un portátil con gráficos integrados

- [ ] Hecho · Responsable: ____ · Equipo (CPU/GPU): ____ · Navegador: ____ · fps medidos: ____

**Qué se comprueba:** la fluidez de la escena base. Se midieron 60 fps en Intel Iris Xe en Chromium headless; falta
confirmarlo en una ventana normal.

**Cómo hacerlo:**

1. Usar un portátil con gráficos integrados (Intel Iris/UHD o AMD Radeon integrada), enchufado a la corriente y en
   modo de energía "alto rendimiento".
2. Abrir el sitio publicado (o `pnpm preview`) en Chrome o Edge, en una ventana maximizada a 1920 × 1080 (o en
   pantalla completa con F11).
3. Pulsar START y esperar a NORMAL.
4. Leer el contador **fps** de la barra superior durante 30 s, o en la consola del navegador (con `?debug=1`):

   ```js
   window.__sim.fps;
   ```

   Opcionalmente, DevTools → More tools → Rendering → **Frame Rendering Stats** muestra el fps del navegador.

**Aprobado si** se mantiene en 50 fps o más. Si la pantalla va a 60 Hz, el máximo será 60.

### 11. P6 · Al menos 50 fps a 1920 × 1080 con todos los conmutadores de vista activos

- [ ] Hecho · Responsable: ____ · Equipo: ____ · fps medidos: ____

**Qué se comprueba:** el caso más exigente. El contenedor de desarrollo no tiene GPU (2 a 5 fps), así que hay que
medirlo en el portátil del equipo.

**Cómo hacerlo:**

1. Usar la misma preparación que en la verificación 10.
2. Activar **Flow**, **Labels**, **Airflow**, **Heat** y **Sound**, y subir el deslizador de exageración de
   vibración (`sld-vib-exaggeration`).
3. Pulsar START, esperar a NORMAL e inyectar desequilibrio 0.3 en M4 para que haya vibración, pulsos de datos y
   cambios de color.
4. Mirar el contador **fps** durante 30 s, incluido el momento del CRITICAL.

**Aprobado si** se mantiene en 50 fps o más durante toda la secuencia.

### 12. P7.4 · Primera carga en menos de 4 s con una conexión normal

- [ ] Hecho · Responsable: ____ · Conexión: ____ · Tiempo medido: ____

**Qué se comprueba:** el tiempo de carga del sitio publicado.

**Cómo hacerlo:**

1. Abrir Chrome en una ventana de incógnito (sin caché).
2. Abrir DevTools → pestaña **Network**, marcar **Disable cache** y dejar el throttling en **No throttling** (o
   **Fast 4G** para simular una conexión normal de móvil).
3. Abrir https://creeplyndarker.github.io/3D-SIMULATOR-IOT/.
4. Anotar el valor **Load** de la barra inferior de Network y comprobar que la escena se ve y el estado del modelo
   (`model-status`) muestra READY.
5. Opcionalmente, DevTools → **Lighthouse** → Performance → Analyze, y anotar el "Largest Contentful Paint".
6. Repetir 3 veces y anotar la mediana.

**Aprobado si** la mediana es menor de 4 s y la app queda usable (escena visible y modelo READY) dentro de ese
tiempo.

### 13. P7.4 · La demo Línea base → Desequilibrio → Disparo → Reset cabe en 3 minutos

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Tiempo: ____

**Qué se comprueba:** que la demostración en vivo cabe en el tiempo de la presentación.

**Cómo hacerlo (con cronómetro):**

1. Abrir la app con la cámara general. Poner la velocidad (`sel-speed`) en 4× si se quiere acortar la espera.
2. **Línea base:** pulsar START, esperar a NORMAL y explicar los gráficos (puntaje bajo, persistencia 0/5).
3. **Desequilibrio:** subir `sld-imbalance` a 0.3 en M4 y mostrar cómo sube la vibración y el puntaje.
4. **Disparo:** esperar a CRITICAL, mostrar el relé abierto, el motivo del disparo (RCF) y la variable dominante
   (`a_rms_g`).
5. **Reset:** esperar a que el ventilador baje de 100 rpm, pulsar RESET → confirmar, volver a OFF y limpiar las
   fallas (`btn-clear-faults`).
6. Alternativa guiada: **Scenario → S2 imbalance** hace la misma secuencia sola.

**Aprobado si** la secuencia completa, con la explicación oral, dura 3 minutos o menos. Ensayarla al menos una vez
con la persona que presentará.

---

## D. Puente en vivo y placa real (fase P8)

### 14. P8.1 · El entorno de Python del puente se instala y funciona en el portátil del equipo

- [ ] Hecho · Responsable: ____ · Sistema operativo: ____ · Python: ____ · Resultado: ____

**Qué se comprueba:** que el puente funciona en el portátil que se usará con la placa. Se puede hacer ya con el
ESP32 emulado.

**Archivo de referencia:** `bridge-py/README.md`.

**Linux / macOS:**

```bash
python3 -m venv bridge-py/.venv
```

```bash
bridge-py/.venv/bin/pip install -r bridge-py/requirements-dev.txt
```

```bash
pnpm build
```

```bash
bridge-py/.venv/bin/python -m pytest -q bridge-py/tests
```

**Windows (PowerShell):**

```powershell
py -3 -m venv bridge-py\.venv
```

```powershell
bridge-py\.venv\Scripts\pip install -r bridge-py\requirements-dev.txt
```

```powershell
pnpm build
```

```powershell
bridge-py\.venv\Scripts\python -m pytest -q bridge-py\tests
```

**Prueba completa con el ESP32 emulado.** En una terminal, arrancar el puente (en Windows, usar
`bridge-py\.venv\Scripts\python`):

```bash
bridge-py/.venv/bin/python bridge-py/app.py
```

En una segunda terminal, arrancar el ESP32 emulado:

```bash
bridge-py/.venv/bin/python bridge-py/fake_esp32.py --speed 4 --fault imbalance_g=0.3@60
```

Después:

1. Abrir http://localhost:8765, elegir **Mode → Live** y esperar el aviso verde.
2. Pulsar START, esperar NORMAL y luego CRITICAL (el desequilibrio entra a los 60 s simulados).
3. Esperar a que el ventilador baje de 100 rpm y hacer RESET.

En Windows, aceptar el aviso del firewall para el puerto UDP 4211 la primera vez.

**Aprobado si** `pytest` muestra `10 passed`, la secuencia START → NORMAL → CRITICAL → RESET → OFF funciona, y
http://localhost:8765/status muestra los contadores con `invalid_up` y `invalid_down` en 0.

### 15. P8 · Los paquetes reales de la placa se muestran sin cambios fuera de `src/bridge/`

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Requisito:** firmware real cargado en el ESP32, basado en `src/firmware/reference-cpp/`. Debe enviar paquetes
JSON por UDP al puerto 4211 del portátil y escuchar en el 4210.

**Cómo hacerlo:**

1. Conectar la placa y el portátil a la misma red Wi-Fi. En el firmware, `LAPTOP_IP` debe ser la IP del portátil.
2. Arrancar el puente:

   ```bash
   bridge-py/.venv/bin/python bridge-py/app.py
   ```

   Si la placa no se detecta sola, añadir `--esp32-host <IP de la placa>`.

3. Comprobar en http://localhost:8765/status que el contador `packet` sube cada segundo y que `invalid_up` sigue en 0. Si sube `invalid_up`, el archivo de sesión `bridge-py/sessions/session-*.jsonl` indica qué campo falla.
4. Abrir http://localhost:8765, elegir **Mode → Live** y comprobar que:
   - las rpm, la vibración, la corriente, la temperatura y el estado coinciden con el banco real;
   - las aspas giran, el relé se mueve y el color de calor cambia;
   - los campos que la placa no envía muestran "—".
5. Comprobar con git que no hizo falta cambiar nada fuera de `src/bridge/`:

   ```bash
   git status --short
   ```

**Aprobado si** todo se muestra correctamente y los únicos cambios necesarios (si los hubo) están en `src/bridge/`.
Si el formato del paquete del firmware difiere del protocolo, se corrige el firmware, no la app.

### 16. P8 · `btn-estop` en modo Live abre el relé real

- [ ] Hecho · Responsable: ____ · Fecha: ____ · Resultado: ____

**Seguridad:** el E-STOP de la app es un mensaje por Wi-Fi y **no** es un paro de seguridad. Durante toda la prueba,
alguien debe tener a mano el interruptor o el enchufe de la fuente de 12 V.

**Cómo hacerlo:**

1. Con la placa en Live (verificación 15), pulsar START y esperar a NORMAL con el ventilador girando.
2. Pulsar **E-STOP** (`btn-estop`, o la tecla E).
3. Comprobar en el banco que el relé CH2 hace clic, su LED se apaga y el ventilador se frena hasta pararse.
4. En la app: el estado pasa a CRITICAL con motivo ESTOP y el relé aparece abierto.
5. Esperar a que baje de 100 rpm, hacer RESET → confirmar y comprobar que vuelve a OFF.
6. Repetir 3 veces y anotar el retraso aproximado entre pulsar el botón y el clic del relé.

**Aprobado si** el relé real se abre las 3 veces, en menos de 1 s aproximadamente.

### 17. P8.4 · `pnpm calibrate` da valores plausibles con una grabación real

- [ ] Hecho · Responsable: ____ · Archivo de sesión: ____ · Resultado: ____

**Qué se comprueba:** que la calibración ajusta el modelo del simulador al banco real con valores razonables.

**Cómo grabar la sesión** (protocolo `CALIBRATION_SCENARIO`, en `src/shared/calibration.ts`):

1. Dejar el ventilador apagado al menos 15 minutos para que esté a temperatura ambiente.
2. Arrancar el puente. Cada arranque crea un archivo nuevo en `bridge-py/sessions/`.
3. Con la placa enviando paquetes y el ventilador quieto, esperar **10 s**.
4. Pulsar **START** y dejarlo funcionando **10 minutos**, sin tocar nada ni mover el banco.
5. Pulsar **E-STOP** y esperar **30 s** más con el ventilador parado.
6. Detener el puente (Ctrl+C).

**Cómo calibrar:**

```bash
pnpm calibrate bridge-py/sessions/session-AAAAMMDD-HHMMSS.jsonl
```

El script imprime una tabla con el valor actual, el propuesto, el cambio en % y de qué parte de la grabación sale
cada uno. Escribe además `bridge-py/sessions/session-AAAAMMDD-HHMMSS.config.diff`. **Nunca** modifica
`src/shared/config.ts` por sí solo.

Para ver que la herramienta funciona antes de usar la placa, se puede probar con una grabación simulada:

```bash
pnpm calibrate --record prueba.jsonl --set fan.rpmRated=3500
```

```bash
pnpm calibrate prueba.jsonl
```

**Cómo revisar:**

1. Comparar los valores propuestos con la realidad:
   - `fan.rpmRated` ≈ rpm medidas con la placa;
   - `thermal.ambient_C` ≈ temperatura de la sala;
   - `fan.iIdle_A` + `fan.iAero_A` ≈ corriente medida con un multímetro;
   - los ruidos de sensor deben estar en el mismo orden de magnitud que los actuales.
2. Las líneas marcadas con ⚠ están fuera del rango de ajuste de `docs/PLAN.md` §5.2 y hay que discutirlas en equipo
   antes de aceptarlas.
3. Si son razonables, aplicar el diff y verificar que todo sigue pasando:

   ```bash
   git apply --check bridge-py/sessions/session-AAAAMMDD-HHMMSS.config.diff
   ```

   ```bash
   git apply bridge-py/sessions/session-AAAAMMDD-HHMMSS.config.diff
   ```

   ```bash
   pnpm verify
   ```

4. Como los parámetros cambian, puede ser necesario regenerar el modelo y los fixtures (`pnpm gen:model`,
   `pnpm gen:fixtures`) y volver a pasar `pnpm test:e2e`. Registrar el cambio en `docs/DECISIONS.md`.

**Aprobado si** los valores son físicamente plausibles, `pnpm verify` pasa con la configuración nueva y el equipo
acepta el cambio en `docs/DECISIONS.md`.

---

## Resumen

| #   | ID        | Verificación                                | Requiere                    | Estado |
| --- | --------- | ------------------------------------------- | --------------------------- | ------ |
| 1   | P1.2      | Piezas reconocibles junto a su foto         | Navegador                   | ☐      |
| 2   | P1.3      | Banco de laboratorio ordenado               | Navegador                   | ☐      |
| 3   | P1.4      | Ningún cable atraviesa una pieza            | Navegador                   | ☐      |
| 4   | P5.1      | Interfaz legible a 1280 × 720 y 1920 × 1080 | Navegador                   | ☐      |
| 5   | P5.G      | Falla y reset sin instrucciones             | Un compañero                | ☐      |
| 6   | P6        | Las animaciones muestran causa y efecto     | Una persona ajena           | ☐      |
| 7   | P6.3/P6.4 | Sonidos del relé y del ventilador           | Auriculares                 | ☐      |
| 8   | P7.3      | Textos coherentes con el informe            | Informe final               | ☐      |
| 9   | P3.7      | C++ plausible para ESP32                    | Arduino IDE (opcional)      | ☐      |
| 10  | P1.6      | ≥ 50 fps con gráficos integrados            | Portátil del equipo         | ☐      |
| 11  | P6        | ≥ 50 fps con todos los conmutadores         | Portátil del equipo         | ☐      |
| 12  | P7.4      | Primera carga < 4 s                         | Navegador + red             | ☐      |
| 13  | P7.4      | Demo en ≤ 3 minutos                         | Cronómetro                  | ☐      |
| 14  | P8.1      | Puente instalado y funcionando              | Portátil + Python           | ☐      |
| 15  | P8        | Paquetes reales se muestran                 | Placa + firmware            | ☐      |
| 16  | P8        | E-STOP abre el relé real                    | Placa + firmware            | ☐      |
| 17  | P8.4      | Calibración plausible                       | Placa + 11 min de grabación | ☐      |
