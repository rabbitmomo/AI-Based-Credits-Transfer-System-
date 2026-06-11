const normalizeRole = (value) => {
  const text = String(value || '').trim();
  return text.length > 0 ? text : 'pelajar';
};

const readMetadataRole = (metadata) => {
  if (!metadata) {
    return 'pelajar';
  }

  return normalizeRole(metadata.peranan || metadata.role || metadata.user_role);
};

const readMetadataName = (metadata, fallbackName) => {
  if (!metadata) {
    return fallbackName;
  }

  return metadata.full_name || metadata.namaPengguna || metadata.name || fallbackName;
};

export const buildSupabaseProfile = (supabaseUser) => {
  if (!supabaseUser) {
    return null;
  }

  const fallbackName = supabaseUser.email ? supabaseUser.email.split('@')[0] : 'user';
  const metadata = supabaseUser.user_metadata || supabaseUser.app_metadata || {};

  return {
    id: supabaseUser.id,
    idPengguna: supabaseUser.id,
    namaPengguna: readMetadataName(metadata, fallbackName),
    emel: supabaseUser.email || '',
    peranan: readMetadataRole(metadata),
  };
};

export const normalizeAppUser = (userData) => {
  if (!userData) {
    return null;
  }

  const fallbackName = userData.emel ? userData.emel.split('@')[0] : 'user';

  return {
    ...userData,
    id: userData.id || userData.idPengguna || null,
    idPengguna: userData.idPengguna || userData.id || null,
    namaPengguna: userData.namaPengguna || userData.full_name || userData.name || fallbackName,
    emel: userData.emel || userData.email || '',
    peranan: normalizeRole(userData.peranan || userData.role),
  };
};

export const resolveRoleRoute = (role) => {
  switch (normalizeRole(role)) {
    case 'ketua_program':
      return '/kp-dashboard';
    case 'pentadbir':
      return '/admin-dashboard';
    default:
      return '/student-dashboard';
  }
};

export const normalizeRoleName = normalizeRole;
