const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const supabase = require('../config/supabase');

router.use(authenticate);

// === GET AGENT COMMISSIONS ===
router.get('/mis-ganancias', async (req, res) => {
    try {
        const { data: comisiones, error } = await supabase
            .from('comisiones')
            .select(`
                *,
                ofertas(
                    id, 
                    importe_final, 
                    importe_ofertado, 
                    propiedades(id, direccion, tipo_propiedad)
                )
            `)
            .eq('agente_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(comisiones);
    } catch (error) {
        console.error('Get Commissions Error:', error);
        res.status(500).json({ error: 'Error al obtener comisiones' });
    }
});

module.exports = router;
