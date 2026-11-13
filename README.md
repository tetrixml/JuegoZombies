
Videojuego de disparos en primera persona ambientado en una instalación militar infestada de zombis. Objetivo: atravesar la base, sobrevivir y llegar a la
zona de extracción.

## Cómo ejecutarlo

VS Code -> extensión "Live Server" -> clic derecho en index.html -> Open with Live Server



## Controles

| Tecla | Acción |
|---|---|
| W / S / A / D | Avanzar / retroceder / izquierda / derecha |
| Mouse | Orientar la cámara |
| Clic izquierdo | Un disparo por clic (mantener presionado **no** dispara en automático) |
| 1 / 2 | Pistola / Rifle de asalto |
| Esc | Pausa |

## Estructura


index.html                 HUD (HTML/CSS) + importmap de Three.js
main.js                    Todo el juego, comentado por secciones
models/pistola.glb         Arma 1
models/rifle.glb           Arma 2 (diseño distinto)
models/zombie.glb          Zombi básico
models/zombie_cono.glb     Zombi con cono (más rápido)
tools/generar_modelos.py   Script que genera los .glb (se puede modificar y volver a ejecutar)
