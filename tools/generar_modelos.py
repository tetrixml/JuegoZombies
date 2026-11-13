
import struct, json, os

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SALIDA = os.path.join(RAIZ, 'models')
os.makedirs(SALIDA, exist_ok=True)


def a_lineal(c):
    
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def color_lineal(hexa):
    h = hexa.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [a_lineal(r), a_lineal(g), a_lineal(b), 1.0]


def datos_cubo():
   
    ejes = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}
    caras = [('x', 1, 'y', 'z'), ('x', -1, 'z', 'y'), ('y', 1, 'z', 'x'),
             ('y', -1, 'x', 'z'), ('z', 1, 'x', 'y'), ('z', -1, 'y', 'x')]
    pos, nor, idx = [], [], []
    for eje, signo, u, v in caras:
        n = [c * signo for c in ejes[eje]]
        U, V = ejes[u], ejes[v]
        base = len(pos) // 3
        for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            p = [n[i] * 0.5 + U[i] * su * 0.5 + V[i] * sv * 0.5 for i in range(3)]
            pos += p
            nor += n
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
    return pos, nor, idx


class Glb:
    def __init__(self):
        self.nodos, self.materiales, self.mallas = [], [], []
        self._mat, self._malla = {}, {}

    def material(self, color, metal=0.0, rug=0.85, emisivo=None):
        k = (color, metal, rug, emisivo)
        if k not in self._mat:
            m = {'pbrMetallicRoughness': {'baseColorFactor': color_lineal(color),
                                          'metallicFactor': metal, 'roughnessFactor': rug}}
            if emisivo:
                m['emissiveFactor'] = color_lineal(emisivo)[:3]
            self.materiales.append(m)
            self._mat[k] = len(self.materiales) - 1
        return self._mat[k]

    def malla(self, mat):
        if mat not in self._malla:
            self.mallas.append({'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1},
                                                'indices': 2, 'material': mat}]})
            self._malla[mat] = len(self.mallas) - 1
        return self._malla[mat]

    def nodo(self, nombre, t=None, hijos=None, malla=None, s=None):
        n = {'name': nombre}
        if t and any(t): n['translation'] = list(t)
        if s: n['scale'] = list(s)
        if hijos: n['children'] = list(hijos)
        if malla is not None: n['mesh'] = malla
        self.nodos.append(n)
        return len(self.nodos) - 1

    def caja(self, nombre, centro, tam, color, metal=0.0, rug=0.85, emisivo=None):
        m = self.malla(self.material(color, metal, rug, emisivo))
        return self.nodo(nombre, t=centro, s=tam, malla=m)

    def guardar(self, nombre_raiz, hijos, archivo):
        raiz = self.nodo(nombre_raiz, hijos=hijos)
        pos, nor, idx = datos_cubo()
        b_pos = struct.pack('<%df' % len(pos), *pos)
        b_nor = struct.pack('<%df' % len(nor), *nor)
        b_idx = struct.pack('<%dH' % len(idx), *idx)
        binario = b_pos + b_nor + b_idx
        gltf = {
            'asset': {'version': '2.0', 'generator': 'generar_modelos.py'},
            'scene': 0, 'scenes': [{'nodes': [raiz]}],
            'nodes': self.nodos, 'meshes': self.mallas, 'materials': self.materiales,
            'buffers': [{'byteLength': len(binario)}],
            'bufferViews': [
                {'buffer': 0, 'byteOffset': 0, 'byteLength': len(b_pos), 'target': 34962},
                {'buffer': 0, 'byteOffset': len(b_pos), 'byteLength': len(b_nor), 'target': 34962},
                {'buffer': 0, 'byteOffset': len(b_pos) + len(b_nor), 'byteLength': len(b_idx), 'target': 34963}],
            'accessors': [
                {'bufferView': 0, 'componentType': 5126, 'count': 24, 'type': 'VEC3',
                 'min': [-0.5] * 3, 'max': [0.5] * 3},
                {'bufferView': 1, 'componentType': 5126, 'count': 24, 'type': 'VEC3'},
                {'bufferView': 2, 'componentType': 5123, 'count': 36, 'type': 'SCALAR'}],
        }
        j = json.dumps(gltf, separators=(',', ':')).encode()
        j += b' ' * (-len(j) % 4)
        binario += b'\0' * (-len(binario) % 4)
        total = 12 + 8 + len(j) + 8 + len(binario)
        with open(os.path.join(SALIDA, archivo), 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(j), 0x4E4F534A) + j)
            f.write(struct.pack('<II', len(binario), 0x004E4942) + binario)
        print('OK', archivo, total, 'bytes')


# ZOMBIS
def zombi(con_cono):
    g = Glb()
    piel, piel_osc = '#9db38c', '#869c77'
    chaqueta, pantalon, zapato = '#7b5532', '#4a4e66', '#2a2a2a'
    pelo = '#3b3b3b'

    def pierna(nombre, x):
        a = g.caja('Pierna', (0, -0.4, 0), (0.28, 0.8, 0.3), pantalon)
        z = g.caja('Zapato', (0, -0.85, 0.07), (0.3, 0.1, 0.44), zapato)
        return g.nodo(nombre, t=(x, 0.9, 0), hijos=[a, z])

    def brazo(nombre, x):
        m = g.caja('Manga', (0, -0.2, 0), (0.24, 0.4, 0.24), chaqueta)
        a = g.caja('Antebrazo', (0, -0.5, 0), (0.2, 0.24, 0.2), piel)
        h = g.caja('Mano', (0, -0.68, 0), (0.22, 0.14, 0.22), piel_osc)
        return g.nodo(nombre, t=(x, 0.62, 0), hijos=[m, a, h])

    # Cabeza
    cab = [
        g.caja('Craneo', (0, 0.3, 0), (0.64, 0.6, 0.62), piel),
        g.caja('Pelo', (0, 0.62, -0.06), (0.5, 0.08, 0.4), pelo),
        g.caja('Mechon1', (-0.1, 0.68, 0), (0.06, 0.1, 0.06), pelo),
        g.caja('Mechon2', (0.08, 0.7, 0.05), (0.05, 0.13, 0.05), pelo),
        g.caja('OjoI', (0.15, 0.38, 0.32), (0.22, 0.22, 0.03), '#ffffff'),
        g.caja('OjoD', (-0.15, 0.38, 0.32), (0.22, 0.22, 0.03), '#ffffff'),
        g.caja('PupilaI', (0.13, 0.36, 0.34), (0.08, 0.08, 0.03), '#111111'),
        g.caja('PupilaD', (-0.11, 0.4, 0.34), (0.08, 0.08, 0.03), '#111111'),
        g.caja('CejaI', (0.15, 0.52, 0.32), (0.2, 0.04, 0.03), pelo),
        g.caja('CejaD', (-0.15, 0.5, 0.32), (0.2, 0.04, 0.03), pelo),
        g.caja('Nariz', (0, 0.26, 0.34), (0.07, 0.1, 0.06), piel_osc),
        g.caja('Boca', (0, 0.12, 0.32), (0.34, 0.1, 0.03), '#3a1c1c'),
        g.caja('Diente1', (-0.07, 0.15, 0.335), (0.08, 0.05, 0.02), '#eeeeee'),
        g.caja('Diente2', (0.07, 0.15, 0.335), (0.08, 0.05, 0.02), '#eeeeee'),
        g.caja('OrejaI', (0.34, 0.3, 0), (0.05, 0.14, 0.12), piel_osc),
        g.caja('OrejaD', (-0.34, 0.3, 0), (0.05, 0.14, 0.12), piel_osc),
    ]
    if con_cono:  
        capas = [g.caja('ConoBase', (0, 0.63, 0), (0.78, 0.05, 0.78), '#c85a10')]
        for i in range(5):
            color = '#f2f2f2' if i in (1, 3) else '#ee7a1c'
            capas.append(g.caja('ConoCapa%d' % i, (0, 0.69 + 0.095 * i, 0),
                                (0.62 - 0.11 * i, 0.095, 0.62 - 0.11 * i), color))
        cab.append(g.nodo('Cone', hijos=capas))
    cabeza = g.nodo('Head', t=(0, 0.78, 0), hijos=cab)

    torso = g.nodo('Torso', t=(0, 0.9, 0), hijos=[
        g.caja('Chaqueta', (0, 0.35, 0), (0.72, 0.7, 0.4), chaqueta),
        g.caja('Camisa', (0, 0.4, 0.205), (0.2, 0.6, 0.02), '#e9e4d6'),
        g.caja('Corbata', (0, 0.33, 0.22), (0.1, 0.42, 0.02), '#a82a2a'),
        g.caja('NudoCorbata', (0, 0.58, 0.22), (0.12, 0.1, 0.025), '#a82a2a'),
        g.caja('Cinturon', (0, 0.03, 0), (0.74, 0.08, 0.42), '#222222'),
        cabeza, brazo('ArmL', 0.47), brazo('ArmR', -0.47)])

    g.guardar('Zombie', [pierna('LegL', 0.18), pierna('LegR', -0.18), torso],
              'zombie_cono.glb' if con_cono else 'zombie.glb')


# ARMAS
def pistola():
    g = Glb()
    met, nar = '#2b2f36', '#e8731a'
    partes = [
        g.caja('Corredera', (0, 0.045, -0.11), (0.052, 0.07, 0.30), met, 0.5, 0.4),
        g.caja('Armazon', (0, -0.005, -0.09), (0.046, 0.04, 0.26), '#3c424b', 0.5, 0.5),
        g.caja('PuntaCanon', (0, 0.045, -0.27), (0.03, 0.03, 0.04), '#111111'),
        g.caja('MiraTrasera', (0, 0.087, -0.0), (0.03, 0.02, 0.02), '#111111'),
        g.caja('MiraDelantera', (0, 0.088, -0.25), (0.012, 0.02, 0.015), nar, 0, 0.5, '#7a3a0a'),
        g.caja('Empunadura', (0, -0.075, 0.01), (0.05, 0.13, 0.07), '#6a3d1c', 0, 0.9),
        g.caja('Guardamonte', (0, -0.04, -0.075), (0.012, 0.025, 0.06), met),
        g.caja('Gatillo', (0, -0.035, -0.06), (0.01, 0.03, 0.01), '#111111'),
        g.caja('FranjaI', (0.027, 0.045, -0.11), (0.004, 0.03, 0.2), nar),
        g.caja('FranjaD', (-0.027, 0.045, -0.11), (0.004, 0.03, 0.2), nar),
        g.caja('Mano', (0, -0.085, 0.055), (0.075, 0.11, 0.1), '#2f3626', 0, 1.0),
        g.caja('Pulgar', (-0.04, -0.03, 0.0), (0.03, 0.03, 0.07), '#2f3626', 0, 1.0),
        g.nodo('Muzzle', t=(0, 0.045, -0.3)),
    ]
    g.guardar('Pistola', partes, 'pistola.glb')


def rifle():
    g = Glb()
    oliva, osc = '#47553a', '#2d3624'
    partes = [
        g.caja('Cuerpo', (0, 0, -0.12), (0.06, 0.09, 0.45), oliva, 0.3, 0.6),
        g.caja('Guardamanos', (0, -0.005, -0.33), (0.07, 0.075, 0.2), osc, 0.2, 0.7),
        g.caja('Canon', (0, 0.02, -0.5), (0.028, 0.028, 0.3), '#161616', 0.8, 0.35),
        g.caja('Apagallamas', (0, 0.02, -0.66), (0.04, 0.04, 0.04), '#222222', 0.6, 0.4),
        g.caja('Culata', (0, -0.015, 0.2), (0.05, 0.12, 0.2), '#5a3a1f', 0, 0.9),
        g.caja('Cargador', (0, -0.13, -0.14), (0.05, 0.17, 0.08), '#1e1e1e', 0.3, 0.6),
        g.caja('Empunadura', (0, -0.1, 0.02), (0.045, 0.12, 0.05), '#222222'),
        g.caja('SoporteMira', (0, 0.065, -0.12), (0.03, 0.02, 0.1), '#101010'),
        g.caja('Mira', (0, 0.095, -0.12), (0.04, 0.045, 0.2), '#101010', 0.4, 0.5),
        g.caja('Lente', (0, 0.095, -0.225), (0.03, 0.032, 0.01), '#4aa3ff', 0, 0.2, '#1a5599'),
        g.caja('Mano', (0, -0.09, 0.04), (0.08, 0.12, 0.1), '#2f3626', 0, 1.0),
        g.caja('ManoDelantera', (0, -0.045, -0.33), (0.085, 0.05, 0.12), '#2f3626', 0, 1.0),
        g.nodo('Muzzle', t=(0, 0.02, -0.7)),
    ]
    g.guardar('Rifle', partes, 'rifle.glb')


if __name__ == '__main__':
    pistola(); rifle(); zombi(False); zombi(True)
