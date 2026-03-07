const supabase = require('../config/supabase');

// === LEVEL THRESHOLDS ===
const LEVELS = [
    { nivel: 'Novato', min: 0, max: 499, color: '#888888', icon: '🌱' },
    { nivel: 'Aprendiz', min: 500, max: 1499, color: '#4ade80', icon: '⬆️' },
    { nivel: 'Profesional', min: 1500, max: 3999, color: '#60a5fa', icon: '💎' },
    { nivel: 'Experto', min: 4000, max: 7999, color: '#a78bfa', icon: '🔮' },
    { nivel: 'Maestro', min: 8000, max: 14999, color: '#f59e0b', icon: '👑' },
    { nivel: 'Leyenda', min: 15000, max: Infinity, color: '#d4af37', icon: '🏆' }
];

// === POINT VALUES PER ACTION ===
const PUNTOS_CONFIG = {
    captacion: 30,
    propiedad_alta: 20,
    visita_completada: 15,
    oferta_enviada: 10,
    venta_cerrada: 100,
    alquiler_cerrado: 60,
    cliente_nuevo: 10,
    streak_bonus: 5   // per day on streak
};

const getLevel = (pts) => LEVELS.find(l => pts >= l.min && pts <= l.max) || LEVELS[0];

// === MY POINTS + PROFILE ===
exports.getMisPuntos = async (req, res) => {
    try {
        const userId = req.user.id;

        // Upsert puntos_agente if first call
        let { data: perfil, error } = await supabase
            .from('puntos_agente')
            .select('*')
            .eq('agente_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            // Record doesn't exist yet, create it
            const { data: newPerfil } = await supabase
                .from('puntos_agente')
                .insert([{ agente_id: userId, puntos_totales: 0, racha_actual: 0, mejor_racha: 0 }])
                .select()
                .single();
            perfil = newPerfil;
        } else if (error) {
            throw error;
        }

        // Get recent points history
        const { data: historial } = await supabase
            .from('historial_puntos')
            .select('*')
            .eq('agente_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        // Get earned badges
        const { data: badges } = await supabase
            .from('logros_agente')
            .select('*, logros(nombre, descripcion, icono, tipo)')
            .eq('agente_id', userId)
            .order('obtenido_en', { ascending: false });

        const nivel = getLevel(perfil.puntos_totales);
        const nextLevel = LEVELS[LEVELS.indexOf(nivel) + 1];
        const progress = nextLevel
            ? Math.round(((perfil.puntos_totales - nivel.min) / (nextLevel.min - nivel.min)) * 100)
            : 100;

        res.json({
            perfil,
            nivel,
            nextLevel,
            progress,
            historial: historial || [],
            badges: badges || []
        });
    } catch (error) {
        console.error('Get Mis Puntos Error:', error);
        res.status(500).json({ error: 'Error al obtener puntos' });
    }
};

// === AWARD POINTS (Internal — called by other controllers) ===
exports.awardPoints = async (userId, accion, entidadId = null) => {
    const pts = PUNTOS_CONFIG[accion] || 0;
    if (!pts || !userId) return;

    try {
        // Avoid duplicate awards for same entity
        if (entidadId) {
            const { data: exists } = await supabase
                .from('historial_puntos')
                .select('id')
                .eq('agente_id', userId)
                .eq('accion', accion)
                .eq('entidad_id', entidadId)
                .limit(1);

            if (exists && exists.length > 0) return; // Already awarded
        }

        // Insert history record
        await supabase.from('historial_puntos').insert([{
            agente_id: userId,
            accion,
            puntos: pts,
            entidad_id: entidadId
        }]);

        // Update totals
        const { data: perfil } = await supabase.from('puntos_agente').select('*').eq('agente_id', userId).single();
        if (perfil) {
            const newTotal = (perfil.puntos_totales || 0) + pts;
            const newRacha = (perfil.racha_actual || 0) + 1;
            const mejorRacha = Math.max(perfil.mejor_racha || 0, newRacha);

            await supabase.from('puntos_agente').update({
                puntos_totales: newTotal,
                racha_actual: newRacha,
                mejor_racha: mejorRacha
            }).eq('agente_id', userId);
        } else {
            await supabase.from('puntos_agente').insert([{
                agente_id: userId,
                puntos_totales: pts,
                racha_actual: 1,
                mejor_racha: 1
            }]);
        }

        // Check badges after point award
        await checkBadges(userId);
    } catch (err) {
        console.error('Award Points Error:', err);
    }
};

// === BADGE DETECTION ===
async function checkBadges(userId) {
    try {
        const { data: perfil } = await supabase.from('puntos_agente').select('puntos_totales, mejor_racha').eq('agente_id', userId).single();
        const { data: logros } = await supabase.from('logros').select('*');
        const { data: earned } = await supabase.from('logros_agente').select('logro_id').eq('agente_id', userId);

        const earnedIds = new Set((earned || []).map(l => l.logro_id));

        for (const logro of (logros || [])) {
            if (earnedIds.has(logro.id)) continue;

            const cond = logro.condicion || {};
            let earned = false;

            if (cond.min_puntos && perfil.puntos_totales >= cond.min_puntos) earned = true;
            if (cond.min_racha && perfil.mejor_racha >= cond.min_racha) earned = true;

            if (earned) {
                await supabase.from('logros_agente').insert([{
                    agente_id: userId,
                    logro_id: logro.id,
                    obtenido_en: new Date().toISOString()
                }]);
            }
        }
    } catch (err) {
        console.error('Check Badges Error:', err);
    }
}

// === WEEKLY RANKING ===
exports.getRankingSemanal = async (req, res) => {
    try {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const { data: historial, error } = await supabase
            .from('historial_puntos')
            .select('agente_id, puntos, usuarios:usuarios!agente_id(id, nombre)')
            .gte('created_at', weekStart.toISOString());

        if (error) throw error;

        // Aggregate by user
        const ranking = {};
        historial.forEach(h => {
            const key = h.agente_id;
            if (!ranking[key]) ranking[key] = { agente_id: key, nombre: h.usuarios?.nombre || 'Agente', puntos: 0 };
            ranking[key].puntos += h.puntos;
        });

        const sorted = Object.values(ranking)
            .sort((a, b) => b.puntos - a.puntos)
            .slice(0, 10)
            .map((r, idx) => ({ ...r, posicion: idx + 1 }));

        res.json(sorted);
    } catch (error) {
        console.error('Ranking Error:', error);
        res.status(500).json({ error: 'Error al obtener ranking' });
    }
};

// === MONTHLY RANKING ===
exports.getRankingMensual = async (req, res) => {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const { data: historial, error } = await supabase
            .from('historial_puntos')
            .select('agente_id, puntos, usuarios:usuarios!agente_id(id, nombre)')
            .gte('created_at', monthStart);

        if (error) throw error;

        const ranking = {};
        historial.forEach(h => {
            const key = h.agente_id;
            if (!ranking[key]) ranking[key] = { agente_id: key, nombre: h.usuarios?.nombre || 'Agente', puntos: 0 };
            ranking[key].puntos += h.puntos;
        });

        const sorted = Object.values(ranking)
            .sort((a, b) => b.puntos - a.puntos)
            .slice(0, 10)
            .map((r, idx) => ({ ...r, posicion: idx + 1 }));

        res.json(sorted);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener ranking mensual' });
    }
};

// === ADMIN: UPDATE CONFIG ===
exports.updateConfig = async (req, res) => {
    try {
        const updates = req.body; // e.g. { captacion: 35, visita_completada: 20 }
        // In production, you'd store this in a config table, for now return the merged config
        const merged = { ...PUNTOS_CONFIG, ...updates };
        res.json({ message: 'Configuración actualizada', config: merged });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
};

// === GET ALL BADGES (catalog) ===
exports.getLogros = async (req, res) => {
    try {
        const { data: logros, error } = await supabase
            .from('logros')
            .select('*')
            .order('condicion->min_puntos', { ascending: true });

        if (error) throw error;
        res.json(logros);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener logros' });
    }
};

module.exports = { ...module.exports, awardPoints: exports.awardPoints };
