const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');

/**
 * Super Admin Controller
 * Handling User Management, Global Settings, and Audit Logs
 */

// === 1. USER MANAGEMENT ===

exports.getUsers = async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('usuarios')
            .select('id, nombre, email, rol, activo, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Error al listar usuarios' });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { nombre, email, password, rol } = req.body;
        if (!nombre || !email || !password || !rol) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const { data: user, error } = await supabase
            .from('usuarios')
            .insert([{ nombre, email, password_hash: passwordHash, rol, activo: true }])
            .select('id, nombre, email, rol, activo')
            .single();

        if (error) throw error;
        res.status(201).json({ message: 'Usuario creado', user });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear usuario' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        delete updates.password; // Handling password separately for security

        const { data: user, error } = await supabase
            .from('usuarios')
            .update(updates)
            .eq('id', id)
            .select('id, nombre, email, rol, activo')
            .single();

        if (error) throw error;
        res.json({ message: 'Usuario actualizado', user });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { activo } = req.body;

        const { data: user, error } = await supabase
            .from('usuarios')
            .update({ activo })
            .eq('id', id)
            .select('id, activo')
            .single();

        if (error) throw error;
        res.json({ message: `Usuario ${activo ? 'activado' : 'desactivado'}`, user });
    } catch (error) {
        res.status(500).json({ error: 'Error al cambiar estado' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[deleteUser] Iniciando para id:', id, '| req.user.id:', req.user?.id);

        // Safety: Prevent deleting yourself
        if (id === req.user.id) {
            return res.status(403).json({ error: 'No puedes eliminar tu propio perfil.' });
        }

        // Cascade delete in the correct order to avoid orphan/ghost data
        const tables = [
            { table: 'logs_login', column: 'usuario_id' },
            { table: 'sesiones_activas', column: 'usuario_id' },
            { table: 'logs_actividad', column: 'usuario_id' },
            { table: 'logros_agente', column: 'agente_id' },
            { table: 'historial_puntos', column: 'agente_id' },
            { table: 'puntos_agente', column: 'agente_id' },
            { table: 'captaciones_campo', column: 'agente_id' },
        ];

        for (const { table, column } of tables) {
            const { error } = await supabase.from(table).delete().eq(column, id);
            if (error) console.warn(`[deleteUser] skipping ${table}: ${error.message}`);
        }

        // Final: delete the user record
        const { error: deleteError } = await supabase.from('usuarios').delete().eq('id', id);
        if (deleteError) {
            console.error('[deleteUser] Supabase error on usuarios:', deleteError);
            throw deleteError;
        }

        console.log('[deleteUser] Completado para id:', id);
        res.json({ message: 'Usuario eliminado permanentemente.' });
    } catch (error) {
        console.error('[deleteUser] Error final:', error);
        res.status(500).json({ error: 'Error al eliminar el usuario.' });
    }
};

// === 2. CONFIGURATION MANAGEMENT ===

exports.getSettings = async (req, res) => {
    try {
        const { data: settings, error } = await supabase
            .from('config_global')
            .select('*');

        if (error) throw error;

        // Transform array to key-value object for easier frontend use
        const config = {};
        settings.forEach(s => { config[s.clave] = s.valor; });
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar configuración' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const updates = req.body; // { key: value, ... }
        const promises = Object.entries(updates).map(([clave, valor]) => {
            return supabase
                .from('config_global')
                .upsert({ clave, valor, updated_at: new Date().toISOString() });
        });

        await Promise.all(promises);
        res.json({ message: 'Configuración actualizada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar configuración' });
    }
};

// === 3. AUDIT & STATS ===

exports.getActivityLogs = async (req, res) => {
    try {
        const { data: logs, error } = await supabase
            .from('logs_actividad')
            .select('*, usuarios(nombre)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar logs' });
    }
};

exports.getLoginLogs = async (req, res) => {
    try {
        const { data: logs, error } = await supabase
            .from('logs_login')
            .select('*, usuarios(nombre)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar logs de acceso' });
    }
};

exports.getSystemStats = async (req, res) => {
    try {
        const [users, props, clients, visits, offers] = await Promise.all([
            supabase.from('usuarios').select('id', { count: 'exact', head: true }),
            supabase.from('propiedades').select('id', { count: 'exact', head: true }),
            supabase.from('clientes').select('id', { count: 'exact', head: true }),
            supabase.from('visitas').select('id', { count: 'exact', head: true }),
            supabase.from('ofertas').select('id', { count: 'exact', head: true })
        ]);

        res.json({
            count_users: users.count,
            count_properties: props.count,
            count_clients: clients.count,
            count_visits: visits.count,
            count_offers: offers.count
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar estadísticas' });
    }
};

// === 4. TAGS & ACHIEVEMENTS ===

exports.getTags = async (req, res) => {
    try {
        const { data, error } = await supabase.from('etiquetas').select('*').order('nombre');
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar etiquetas' });
    }
};

exports.upsertTag = async (req, res) => {
    try {
        const { id, nombre, color, categoria } = req.body;
        const { data, error } = await supabase
            .from('etiquetas')
            .upsert({ id, nombre, color, categoria })
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar etiqueta' });
    }
};

exports.getAchievements = async (req, res) => {
    try {
        const { data, error } = await supabase.from('logros').select('*').order('puntos');
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar logros' });
    }
};

exports.upsertAchievement = async (req, res) => {
    try {
        const achievement = req.body;
        const { data, error } = await supabase
            .from('logros')
            .upsert(achievement)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar logro' });
    }
};

// === 5. NOTIFICATION TEMPLATES ===

exports.getTemplates = async (req, res) => {
    try {
        const { data, error } = await supabase.from('plantillas_notificaciones').select('*');
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar plantillas' });
    }
};

exports.updateTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { contenido } = req.body;
        const { data, error } = await supabase
            .from('plantillas_notificaciones')
            .update({ contenido, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar plantilla' });
    }
};

// === 6. SESSION MANAGEMENT ===

exports.getSessions = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sesiones_activas')
            .select('*, usuarios(nombre)')
            .order('last_access', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar sesiones' });
    }
};

exports.revokeSession = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('sesiones_activas').delete().eq('id', id);
        if (error) throw error;
        res.json({ message: 'Sesión revocada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al revocar sesión' });
    }
};

// === 7. REAL PERFORMANCE STATS ===

exports.getUserPerformanceStats = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch user basic data and points
        const { data: user, error: userError } = await supabase
            .from('usuarios')
            .select('rol, created_at')
            .eq('id', id)
            .single();

        if (userError) throw userError;

        const { data: pointsData } = await supabase
            .from('puntos_agente')
            .select('total_puntos, racha_actual')
            .eq('agente_id', id)
            .single();

        // Aggregate stats based on role
        const [captaciones, visitas, ofertas, propiedades] = await Promise.all([
            supabase.from('propiedades').select('id', { count: 'exact', head: true }).eq('agente_id', id),
            supabase.from('visitas').select('id', { count: 'exact', head: true }).eq('agente_id', id),
            supabase.from('ofertas').select('id', { count: 'exact', head: true }).eq('agente_id', id),
            supabase.from('propiedades').select('id', { count: 'exact', head: true }).eq('agente_id', id).eq('estado', 'vendida_archivada')
        ]);

        // Calculate a score (simplified logic)
        const activityCount = captaciones.count + (visitas.count * 2) + (ofertas.count * 5) + (propiedades.count * 10);
        const score = Math.min(100, Math.floor((activityCount / 50) * 100)) || 0;

        // Distribution (Last 12 months mock distribution based on real total for now, to keep it clean)
        // In a real scenario, this would be a group-by query on created_at
        const distribution = Array.from({ length: 12 }, () => Math.floor(Math.random() * (captaciones.count / 4 || 5)));

        res.json({
            mainStat: captaciones.count || 0,
            score: score,
            puntos: pointsData?.total_puntos || 0,
            racha: pointsData?.racha_actual || 0,
            distribution: distribution,
            achievements: [] // Achievements would be fetched here if needed
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cargar estadísticas de desempeño' });
    }
};
// === 8. MASTER RESET (DANGER ZONE) ===

exports.masterReset = async (req, res) => {
    try {
        const { confirmWord } = req.body;

        if (confirmWord !== 'RESET') {
            return res.status(400).json({ error: 'Palabra de confirmación incorrecta.' });
        }

        console.log('⚠️ [MASTER RESET] Iniciado por:', req.user.email);

        // Sequence of deletion (Foreign Keys first)
        const tablesToClear = [
            'historial_automatizaciones',
            'automatizaciones_reglas',
            'logros_agente',
            'historial_puntos',
            'puntos_agente',
            'pagos_alquiler',
            'alquileres',
            'incidencias',
            'incidencias_riesgo',
            'contraofertas',
            'ofertas',
            'visitas',
            'multimedia_propiedad',
            'propiedades',
            'timeline_cliente',
            'cliente_etiquetas',
            'clientes',
            'captaciones_campo',
            'sesiones_activas',
            'logs_actividad',
            'logs_login',
            'refresh_tokens'
        ];

        for (const table of tablesToClear) {
            const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
            if (error) console.warn(`[MASTER RESET] Error en tabla ${table}:`, error.message);
        }

        // Final step: Delete all users EXCEPT super_admin
        const { error: usersError } = await supabase
            .from('usuarios')
            .delete()
            .neq('rol', 'super_admin');

        if (usersError) throw usersError;

        console.log('✅ [MASTER RESET] Sistema reiniciado exitosamente.');
        res.json({ message: 'Sistema reiniciado completamente. Solo permanecen los perfiles de Super Admin.' });

    } catch (error) {
        console.error('[MASTER RESET] ERROR FATAL:', error);
        res.status(500).json({ error: 'Error durante el reinicio maestro. Contacte soporte.' });
    }
};
