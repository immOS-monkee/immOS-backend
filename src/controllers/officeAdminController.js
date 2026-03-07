const supabase = require('../config/supabase');

/**
 * Office Admin Controller
 * Specialized in team management, lead assignment, and operational oversight
 */

// === 1. TEAM SUPERVISION ===

exports.getTeamMembers = async (req, res) => {
    try {
        // Fetch all agents (captación & cierre)
        const { data: agents, error } = await supabase
            .from('usuarios')
            .select('id, nombre, email, rol, activo, created_at')
            .in('rol', ['agente_captacion', 'agente_cierre'])
            .order('nombre');

        if (error) throw error;

        // Fetch basic stats for each agent (visits total, properties assigned)
        // Note: For a real production app, we'd use a more efficient join or view
        const agentStatsPromises = agents.map(async (agent) => {
            const [props, visits] = await Promise.all([
                supabase.from('propiedades').select('id', { count: 'exact', head: true }).eq('agente_id', agent.id),
                supabase.from('visitas').select('id', { count: 'exact', head: true }).eq('agente_id', agent.id)
            ]);
            return {
                ...agent,
                stats: {
                    properties: props.count || 0,
                    visits: visits.count || 0
                }
            };
        });

        const agentsWithStats = await Promise.all(agentStatsPromises);
        res.json(agentsWithStats);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar equipo' });
    }
};

// === 2. LEAD & INVENTORY ASSIGNMENT ===

exports.assignToAgent = async (req, res) => {
    try {
        const { entityType, entityId, agentId } = req.body; // entityType: 'cliente' | 'propiedad' | 'captacion'

        if (!['cliente', 'propiedad', 'captacion'].includes(entityType)) {
            return res.status(400).json({ error: 'Tipo de entidad no válido' });
        }

        const tableMap = {
            'cliente': 'clientes',
            'propiedad': 'propiedades',
            'captacion': 'captaciones'
        };

        const { data, error } = await supabase
            .from(tableMap[entityType])
            .update({ agente_id: agentId, updated_at: new Date().toISOString() })
            .eq('id', entityId)
            .select()
            .single();

        if (error) throw error;

        // Log the reassignment
        await supabase.from('logs_actividad').insert([{
            usuario_id: req.user.id,
            accion: `reasignacion_${entityType}`,
            detalles: `Reasignado ${entityType} ID ${entityId} al agente ID ${agentId}`
        }]);

        res.json({ message: 'Asignación completada', data });
    } catch (error) {
        res.status(500).json({ error: 'Error al reasignar entidad' });
    }
};

exports.validateCaptation = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, motivo_descarte } = req.body; // estado: 'validada' | 'descartada'

        const { data, error } = await supabase
            .from('captaciones')
            .update({
                estado,
                motivo_descarte: estado === 'descartada' ? motivo_descarte : null,
                validated_at: new Date().toISOString(),
                validator_id: req.user.id
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Log the action
        await supabase.from('logs_actividad').insert([{
            usuario_id: req.user.id,
            accion: `captacion_${estado}`,
            detalles: `${estado === 'validada' ? 'Validada' : 'Descartada'} captacion ID ${id}`
        }]);

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al validar captación' });
    }
};

exports.toggleAgentAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const { disponible } = req.body;

        const { data, error } = await supabase
            .from('usuarios')
            .update({ disponible })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al cambiar disponibilidad del agente' });
    }
};

// === 3. OFFICE PERFORMANCE ===

exports.getOfficeStats = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [pendingCaptations, todayVisits, openIncidents] = await Promise.all([
            supabase.from('captaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
            supabase.from('visitas').select('id', { count: 'exact', head: true }).gte('fecha_visita', `${today}T00:00:00`).lte('fecha_visita', `${today}T23:59:59`),
            supabase.from('incidencias_alquiler').select('id', { count: 'exact', head: true }).eq('estado', 'abierta')
        ]);

        res.json({
            pending_captations: pendingCaptations.count || 0,
            visits_today: todayVisits.count || 0,
            open_incidents: openIncidents.count || 0
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar estadísticas de oficina' });
    }
};

// === 4. GLOBAL CALENDAR ===

exports.getGlobalCalendar = async (req, res) => {
    try {
        const { data: visits, error } = await supabase
            .from('visitas')
            .select('*, usuarios(nombre), propiedades(direccion), clientes(nombre)')
            .order('fecha_visita', { ascending: true });

        if (error) throw error;
        res.json(visits);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar el calendario global' });
    }
};
