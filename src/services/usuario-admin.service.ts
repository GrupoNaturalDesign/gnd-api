import { getFirebaseAdmin } from '../lib/firebase-admin';
import prisma from '../lib/prisma';
import { Rol, type Prisma } from '@prisma/client';
import type { UsuarioQueryParams, CrearUsuarioInput, ActualizarUsuarioInput } from '../validation/usuario-admin.schema';

/** Usuarios de la empresa del entorno o sin empresa (legacy / registro sin tenant). */
function whereUsuarioAlcanceAdmin(empresaId: number): Prisma.UsuarioWhereInput {
  return {
    OR: [{ empresaId }, { empresaId: null }],
  };
}

export class UsuarioAdminService {
  async listar(empresaId: number, params: UsuarioQueryParams) {
    const { page, limit, q, rol, activo } = params;
    const skip = (page - 1) * limit;

    const andParts: Prisma.UsuarioWhereInput[] = [whereUsuarioAlcanceAdmin(empresaId)];

    if (q) {
      andParts.push({
        OR: [
          { email: { contains: q } },
          { nombre: { contains: q } },
          { apellido: { contains: q } },
        ],
      });
    }

    if (rol) {
      andParts.push({ rol });
    }

    if (activo !== undefined) {
      andParts.push({ activo });
    }

    const where: Prisma.UsuarioWhereInput = { AND: andParts };

    const [total, usuarios] = await prisma.$transaction([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          nombre: true,
          apellido: true,
          telefono: true,
          rol: true,
          activo: true,
          emailVerified: true,
          empresaId: true,
          empresa: { select: { id: true, nombre: true } },
          role: { select: { id: true, code: true, name: true } },
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      data: usuarios,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async detalle(id: number, empresaId: number) {
    const usuario = await prisma.usuario.findFirst({
      where: { id, ...whereUsuarioAlcanceAdmin(empresaId) },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        telefono: true,
        rol: true,
        activo: true,
        emailVerified: true,
        empresaId: true,
        empresa: { select: { id: true, nombre: true } },
        role: { select: { id: true, code: true, name: true } },
        createdAt: true,
        updatedAt: true,
        externalId: true,
        provider: true,
      },
    });

    if (!usuario) {
      throw new Error('Usuario no encontrado');
    }

    return usuario;
  }

  async crear(input: CrearUsuarioInput, empresaId: number) {
    const { email, password, nombre, apellido, telefono, rol, empresaId: inputEmpresaId } = input;

    const existingUser = await prisma.usuario.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error('Ya existe un usuario con este email');
    }

    const adminAuth = getFirebaseAdmin().auth();

    let firebaseUid: string;
    try {
      const firebaseUser = await adminAuth.createUser({
        email,
        password,
        displayName: `${nombre} ${apellido || ''}`.trim(),
        emailVerified: true,
      });
      firebaseUid = firebaseUser.uid;
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
        throw new Error('El email ya está en uso en Firebase');
      }
      throw error;
    }

    const role = await prisma.role.findFirst({
      where: { code: rol.toUpperCase() },
    });

    const usuario = await prisma.usuario.create({
      data: {
        externalId: firebaseUid,
        email,
        nombre,
        apellido,
        telefono,
        rol: rol as Rol,
        roleId: role?.id,
        provider: 'firebase',
        emailVerified: true,
        activo: true,
        empresaId: inputEmpresaId || empresaId,
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        telefono: true,
        rol: true,
        activo: true,
        empresaId: true,
        createdAt: true,
      },
    });

    return usuario;
  }

  async actualizar(id: number, empresaId: number, input: ActualizarUsuarioInput) {
    const existing = await prisma.usuario.findFirst({
      where: { id, ...whereUsuarioAlcanceAdmin(empresaId) },
    });

    if (!existing) {
      throw new Error('Usuario no encontrado');
    }

    const { nombre, apellido, telefono, rol, empresaId: newEmpresaId, activo } = input;

    const updateData: any = {};

    if (nombre !== undefined) updateData.nombre = nombre;
    if (apellido !== undefined) updateData.apellido = apellido;
    if (telefono !== undefined) updateData.telefono = telefono;
    if (activo !== undefined) updateData.activo = activo;
    if (newEmpresaId !== undefined) updateData.empresaId = newEmpresaId;

    if (rol !== undefined) {
      updateData.rol = rol as Rol;
      const role = await prisma.role.findFirst({
        where: { code: rol.toUpperCase() },
      });
      updateData.roleId = role?.id || null;
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        telefono: true,
        rol: true,
        activo: true,
        emailVerified: true,
        empresaId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return usuario;
  }

  async desactivar(id: number, empresaId: number) {
    const existing = await prisma.usuario.findFirst({
      where: { id, ...whereUsuarioAlcanceAdmin(empresaId) },
    });

    if (!existing) {
      throw new Error('Usuario no encontrado');
    }

    if (existing.externalId) {
      const adminAuth = getFirebaseAdmin().auth();
      try {
        await adminAuth.updateUser(existing.externalId, { disabled: true });
      } catch (error) {
        console.error('Error disabling Firebase user:', error);
      }
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { activo: false },
      select: {
        id: true,
        email: true,
        activo: true,
        updatedAt: true,
      },
    });

    return usuario;
  }

  async habilitar(id: number, empresaId: number) {
    const existing = await prisma.usuario.findFirst({
      where: { id, ...whereUsuarioAlcanceAdmin(empresaId) },
    });

    if (!existing) {
      throw new Error('Usuario no encontrado');
    }

    if (existing.externalId) {
      const adminAuth = getFirebaseAdmin().auth();
      try {
        await adminAuth.updateUser(existing.externalId, { disabled: false });
      } catch (error) {
        console.error('Error enabling Firebase user:', error);
      }
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { activo: true },
      select: {
        id: true,
        email: true,
        activo: true,
        updatedAt: true,
      },
    });

    return usuario;
  }

  async eliminar(id: number, empresaId: number) {
    const existing = await prisma.usuario.findFirst({
      where: { id, ...whereUsuarioAlcanceAdmin(empresaId) },
    });

    if (!existing) {
      throw new Error('Usuario no encontrado');
    }

    if (existing.externalId) {
      const adminAuth = getFirebaseAdmin().auth();
      try {
        await adminAuth.deleteUser(existing.externalId);
      } catch (error) {
        console.error('Error deleting Firebase user:', error);
      }
    }

    await prisma.usuario.delete({
      where: { id },
    });

    return { id, deleted: true };
  }

  async listarEmpresas() {
    return prisma.empresa.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
  }
}

export const usuarioAdminService = new UsuarioAdminService();