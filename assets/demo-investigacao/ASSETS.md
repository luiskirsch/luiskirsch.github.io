# Ativos da demonstração de investigação 3D

Os ativos abaixo são distribuídos pela Poly Haven sob licença CC0:

- `sofa_02`: Sofa 02 — https://polyhaven.com/a/sofa_02
- `metal_office_desk`: Metal Office Desk — https://polyhaven.com/a/metal_office_desk
- `desk_lamp_arm_01`: Desk Lamp Arm 01 — https://polyhaven.com/a/desk_lamp_arm_01
- `old_wooden_floor_02`: Old Wooden Floor 02 — https://polyhaven.com/a/old_wooden_floor_02
- `plastered_wall_04`: Plastered Wall 04 — https://polyhaven.com/a/plastered_wall_04
- `dirty_carpet`: Dirty Carpet — https://polyhaven.com/a/dirty_carpet

Foram usadas as variantes glTF e PBR de 1K para equilibrar fidelidade visual e tempo de carregamento no navegador.

## Cena 2.5D ultrarrealista

Os arquivos em `scene/` foram gerados com a ferramenta integrada de geração de imagens do Codex e otimizados localmente:

- `arquivo-302-ultrareal.avif`: render principal AVIF.
- `arquivo-302-ultrareal.webp`: fallback WebP.
- `arquivo-302-depth.webp`: mapa de profundidade para paralaxe WebGL.
- `arquivo-302-lqip.webp`: placeholder de carregamento imediato.
- `arquivo-302-desk.*`: segundo ponto de observação, próximo à escrivaninha, com render, fallback, LQIP e profundidade.
- `arquivo-302-sofa.*`: terceiro ponto de observação, próximo ao sofá, com render, fallback, LQIP e profundidade.

A composição é original e foi criada como cenário noturno de investigação, com materiais realistas, objetos individualizados, iluminação cinematográfica e camadas de profundidade. Não contém interface, logotipos ou elementos copiados de jogos existentes.

Os dois pontos adicionais foram gerados pela ferramenta integrada de imagens a partir da sala canônica, com prompts de continuidade espacial. Cada ângulo recebeu um mapa de profundidade próprio para manter a paralaxe WebGL durante a exploração.
