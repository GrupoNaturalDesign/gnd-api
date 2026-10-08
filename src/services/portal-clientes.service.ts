import prisma from '../lib/prisma';
import {
  getPortalClientesConfig,
  isPortalClientesConfigured,
} from '../config/portal-clientes.config';
import {
  resolverIdentidadPortal,
  resolverIdentidadUnica,
  type IdentidadPortal,
} from '../utils/portal-identidad.util';
import {
  construirLinkPortalClientes,
  type PortalClientesSsoLink,
} from '../utils/portal-clientes-token.util';

export type PortalClientesErrorCode =
  | 'PORTAL_NO_CONFIGURADO'
  | 'USUARIO_NO_ENCONTRADO'
  | 'USUARIO_INACTIVO'
  | 'IDENTIFICACION_REQUERIDA';

const STATUS_POR_CODIGO: Record<PortalClientesErrorCode, number> = {
  PORTAL_NO_CONFIGURADO: 503,
  USUARIO_NO_ENCONTRADO: 404,
  USUARIO_INACTIVO: 403,
  IDENTIFICACION_REQUERIDA: 409,
};

export class PortalClientesError extends Error {
  readonly status: number;

  constructor(readonly code: PortalClientesErrorCode, message: string) {
    super(message);
    this.name = 'PortalClientesError';
    this.status = STATUS_POR_CODIGO[code];
  }
}

type FuenteIdentidad = 'cliente_vinculado' | 'sfactory_cliente_id' | 'email_verificado';

interface UsuarioParaPortal {
  id: number;
  email: string;
  emailVerified: boolean;
  sfactoryClienteId: number | null;
  cliente: { cuit: string | null } | null;
}

/**
 * Solo fuentes que el usuario no puede escribir libremente: el portal da acceso por DNI,
 * así que un CUIT tipeado (ej. `pedidos.factura_cuit`) permitiría entrar como otra persona.
 */
async function resolverIdentidadUsuario(
  usuario: UsuarioParaPortal
): Promise<{ identidad: IdentidadPortal; fuente: FuenteIdentidad } | null> {
  const vinculado = resolverIdentidadPortal(usuario.cliente?.cuit);
  if (vinculado) return { identidad: vinculado, fuente: 'cliente_vinculado' };

  if (usuario.sfactoryClienteId != null) {
    const cliente = await prisma.cliente.findUnique({
      where: { sfactoryId: usuario.sfactoryClienteId },
      select: { cuit: true },
    });
    const porSfactory = resolverIdentidadPortal(cliente?.cuit);
    if (porSfactory) return { identidad: porSfactory, fuente: 'sfactory_cliente_id' };
  }

  if (usuario.emailVerified) {
    const clientes = await prisma.cliente.findMany({
      where: { email: usuario.email, activo: true, cuit: { not: null } },
      select: { cuit: true },
    });
    const porEmail = resolverIdentidadUnica(clientes.map((c) => c.cuit));
    if (porEmail) return { identidad: porEmail, fuente: 'email_verificado' };
  }

  return null;
}

export async function generarLinkPortalClientes(uid: string): Promise<PortalClientesSsoLink> {
  if (!isPortalClientesConfigured()) {
    throw new PortalClientesError(
      'PORTAL_NO_CONFIGURADO',
      'El acceso al Portal Clientes no está disponible en este momento.'
    );
  }

  const usuario = await prisma.usuario.findFirst({
    where: { externalId: uid },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      activo: true,
      sfactoryClienteId: true,
      cliente: { select: { cuit: true } },
    },
  });
  if (!usuario) {
    throw new PortalClientesError('USUARIO_NO_ENCONTRADO', 'Usuario no encontrado.');
  }
  if (!usuario.activo) {
    throw new PortalClientesError('USUARIO_INACTIVO', 'Tu cuenta está inactiva.');
  }

  const resultado = await resolverIdentidadUsuario(usuario);
  if (!resultado) {
    console.info('[portal-clientes/sso]', { usuarioId: usuario.id, resultado: 'sin_identidad' });
    throw new PortalClientesError(
      'IDENTIFICACION_REQUERIDA',
      'No encontramos un CUIT/CUIL asociado a tu cuenta para ingresar al Portal Clientes.'
    );
  }

  const link = construirLinkPortalClientes(
    resultado.identidad,
    usuario.email,
    getPortalClientesConfig()
  );
  console.info('[portal-clientes/sso]', {
    usuarioId: usuario.id,
    resultado: 'ok',
    fuente: resultado.fuente,
    tipo: resultado.identidad.dni ? 'persona_fisica' : 'empresa',
  });
  return link;
}
