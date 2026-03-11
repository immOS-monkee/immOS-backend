const supabase = require('../config/supabase');
const logger = require('../utils/logger');

exports.getForecast = async (req, res) => {
    try {
        // 1. Calculate Sales Forecast (Pipeline)
        const { data: pipeline, error: pError } = await supabase
            .from('ofertas')
            .select('importe_ofertado, probabilidad, estado')
            .not('estado', 'in', '("cerrada_exitosa", "cancelada", "rechazada")');

        if (pError) throw pError;

        const forecastVenta = pipeline.reduce((sum, o) => {
            const prob = o.probabilidad / 100;
            return sum + (o.importe_ofertado * prob);
        }, 0);

        // 2. Calculate Rental Forecast (Active Contracts Monthly)
        const { data: alquileres, error: aError } = await supabase
            .from('alquileres')
            .select('monto_mensual')
            .eq('estado', 'activo');

        if (aError) throw aError;

        const ingresoMensualAlquiler = alquileres.reduce((sum, a) => sum + (a.monto_mensual || 0), 0);

        // 3. Historical Comparison (Last 30 days vs Prev 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: recentSales, error: sError } = await supabase
            .from('ofertas')
            .select('importe_final')
            .eq('estado', 'cerrada_exitosa')
            .gte('updated_at', thirtyDaysAgo.toISOString());

        if (sError) throw sError;

        const volumenCerradoMes = recentSales.reduce((sum, s) => sum + (s.importe_final || 0), 0);

        res.json({
            success: true,
            forecast: {
                ventas_proyectadas: forecastVenta,
                alquiler_mensual_recurrente: ingresoMensualAlquiler,
                volumen_cerrado_30d: volumenCerradoMes
            }
        });
    } catch (err) {
        logger.error('BI Forecast Error:', err);
        res.status(500).json({ error: 'Error al generar pronóstico de negocio' });
    }
};

exports.getPerformanceMetrics = async (req, res) => {
    try {
        // Stats by Stage
        const { data: stages, error: stError } = await supabase
            .from('ofertas')
            .select('estado');

        if (stError) throw stError;

        const stats = stages.reduce((acc, curr) => {
            acc[curr.estado] = (acc[curr.estado] || 0) + 1;
            return acc;
        }, {});

        // Captures vs Conversions
        const { count: totalCapturas, error: cError } = await supabase
            .from('captaciones')
            .select('*', { count: 'exact', head: true });

        if (cError) throw cError;

        res.json({
            success: true,
            metrics: {
                distribucion_pipeline: stats,
                total_captaciones: totalCapturas,
                conversion_global: totalCapturas > 0 ? (stats['cerrada_exitosa'] || 0) / totalCapturas : 0
            }
        });
    } catch (err) {
        logger.error('BI Metrics Error:', err);
        res.status(500).json({ error: 'Error al cargar métricas de rendimiento' });
    }
};
