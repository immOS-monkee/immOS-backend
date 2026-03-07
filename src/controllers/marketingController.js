const supabase = require('../config/supabase');

/**
 * Marketing Stats Controller
 * Provides global counts for transparency and campaign planning
 */

exports.getMarketingStats = async (req, res) => {
    try {
        const [propiedades, clientes, captaciones, visitas] = await Promise.all([
            supabase.from('propiedades').select('id', { count: 'exact', head: true }).eq('estado', 'disponible'),
            supabase.from('clientes').select('id', { count: 'exact', head: true }),
            supabase.from('captaciones_campo').select('id', { count: 'exact', head: true }),
            supabase.from('visitas').select('id', { count: 'exact', head: true })
        ]);

        res.json({
            propiedades_disponibles: propiedades.count || 0,
            total_clientes: clientes.count || 0,
            total_captaciones: captaciones.count || 0,
            total_visitas: visitas.count || 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Marketing Stats Error:', error);
        res.status(500).json({ error: 'Error al cargar estadísticas de marketing' });
    }
};
