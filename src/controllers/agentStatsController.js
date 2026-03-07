const supabase = require('../config/supabase');

/**
 * Agent Stats Controller
 * Handles personal metrics and gamification for agents
 */

exports.getAgentMetrics = async (req, res) => {
    try {
        const agentId = req.user.id;
        const today = new Date().toISOString().split('T')[0];

        // Fetch counts for today and total
        const [todayCount, totalCount, streakData] = await Promise.all([
            supabase.from('captaciones_campo').select('id', { count: 'exact', head: true })
                .eq('agente_id', agentId)
                .gte('created_at', `${today}T00:00:00`),
            supabase.from('captaciones_campo').select('id', { count: 'exact', head: true })
                .eq('agente_id', agentId),
            supabase.from('puntos_agente').select('total_puntos, racha_actual').eq('agente_id', agentId)
        ]);

        res.json({
            today_captations: todayCount.count || 0,
            total_captations: totalCount.count || 0,
            puntos: streakData.data?.[0]?.total_puntos || 0,
            racha: streakData.data?.[0]?.racha_actual || 0
        });
    } catch (error) {
        console.error('Agent Metrics Error:', error);
        res.status(500).json({ error: 'Error al cargar métricas del agente' });
    }
};

exports.getAgentAchievements = async (req, res) => {
    try {
        const agentId = req.user.id;

        // Fetch achievements obtained by this agent using schema table names
        const { data, error } = await supabase
            .from('logros_agente')
            .select(`
                fecha_obtencion,
                logros (
                    id,
                    nombre,
                    descripcion,
                    icono
                )
            `)
            .eq('agente_id', agentId);

        if (error) {
            console.warn('Backend: Achievement join failed or table missing, returning empty.', error.message);
            return res.json([]);
        }
        res.json(data || []);
    } catch (error) {
        console.error('Agent Achievements Error:', error);
        res.status(500).json({ error: 'Error al cargar logros del agente' });
    }
};
