const supabase = require('../config/supabase');
const { fireRules } = require('./automatizacionesController');
const { crearInterno } = require('./notificacionController');

// Pipeline stages with probability weights
const STAGES = {
    enviada: { prob: 20, label: 'Enviada' },
    negociacion: { prob: 50, label: 'Negociación' },
    aceptada: { prob: 80, label: 'Aceptada' },
    arras_firmadas: { prob: 95, label: 'Arras Firmadas' },
    cerrada_exitosa: { prob: 100, label: 'Cerrada ✅' },
    cancelada: { prob: 0, label: 'Cancelada' },
    rechazada: { prob: 0, label: 'Rechazada' }
};

// === PIPELINE VIEW (grouped by stage) ===
exports.getPipeline = async (req, res) => {
    try {
        const { data: ofertas, error } = await supabase
            .from('ofertas')
            .select(`
                *,
                propiedades(id, direccion, tipo_propiedad, precio_venta),
                comprador:clientes!comprador_id(id, nombre, heat_score)
            `)
            .not('estado', 'in', '("cerrada_exitosa","cancelada","rechazada")')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by estado
        const pipeline = {};
        Object.keys(STAGES).forEach(s => { pipeline[s] = []; });
        ofertas.forEach(o => {
            if (pipeline[o.estado]) pipeline[o.estado].push(o);
        });

        res.json({ pipeline, stages: STAGES });
    } catch (error) {
        console.error('Get Pipeline Error:', error);
        res.status(500).json({ error: 'Error al cargar el pipeline' });
    }
};

// === LIST ALL ===
exports.getOfertas = async (req, res) => {
    try {
        const { estado } = req.query;
        let query = supabase
            .from('ofertas')
            .select('*, propiedades(id, direccion), comprador:clientes!comprador_id(id, nombre)')
            .order('updated_at', { ascending: false });

        if (estado) query = query.eq('estado', estado);

        const { data: ofertas, error } = await query;
        if (error) throw error;

        res.json(ofertas);
    } catch (error) {
        res.status(500).json({ error: 'Error al listar ofertas' });
    }
};

// === CREATE OFERTA ===
exports.createOferta = async (req, res) => {
    try {
        const { propiedad_id, comprador_id, importe_ofertado, tipo_operacion, notas } = req.body;
        const agente_id = req.user.id;

        if (!propiedad_id || !comprador_id || !importe_ofertado) {
            return res.status(400).json({ error: 'propiedad_id, comprador_id e importe_ofertado son obligatorios' });
        }

        const { data: oferta, error } = await supabase
            .from('ofertas')
            .insert([{
                propiedad_id,
                comprador_id,
                agente_id,
                importe_ofertado,
                importe_final: null,
                tipo_operacion: tipo_operacion || 'venta',
                estado: 'enviada',
                probabilidad: STAGES['enviada'].prob,
                notas: notas || '',
                comision_agente: null
            }])
            .select()
            .single();

        if (error) throw error;

        // Notify AGENT (Agent is the bridge for offers)
        await crearInterno(
            agente_id,
            'Nueva Oferta Recibida 💰',
            `Has recibido una oferta de ${importe_ofertado.toLocaleString()} € para la propiedad en ${propiedad_id}.`,
            'info',
            { oferta_id: oferta.id, propiedad_id }
        );

        // Timeline: Log to buyer
        await supabase.from('timeline_cliente').insert([{
            cliente_id: comprador_id,
            tipo: 'oferta',
            descripcion: `Oferta enviada por ${importe_ofertado.toLocaleString()} €`,
            metadata: { oferta_id: oferta.id, importe: importe_ofertado }
        }]);

        res.status(201).json({ message: 'Oferta creada', oferta });
    } catch (error) {
        console.error('Create Oferta Error:', error);
        res.status(500).json({ error: 'Error al crear la oferta' });
    }
};

// === GET DETAIL ===
exports.getOferta = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: oferta, error } = await supabase
            .from('ofertas')
            .select('*, propiedades(*), comprador:clientes!comprador_id(*)')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Get counteroffer history
        const { data: contraofertas } = await supabase
            .from('contraofertas')
            .select('*')
            .eq('oferta_id', id)
            .order('created_at', { ascending: false });

        res.json({ oferta, contraofertas: contraofertas || [] });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la oferta' });
    }
};

// === CHANGE STATE ===
exports.changeEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, importe_final, notas_cambio } = req.body;

        if (!STAGES[estado]) {
            return res.status(400).json({ error: `Estado inválido. Válidos: ${Object.keys(STAGES).join(', ')}` });
        }

        const updates = {
            estado,
            probabilidad: STAGES[estado].prob,
            updated_at: new Date().toISOString()
        };

        // Closing: calculate commission and change property state
        if (estado === 'cerrada_exitosa') {
            if (!importe_final) {
                return res.status(400).json({ error: 'importe_final es obligatorio para cerrar la oferta' });
            }
            updates.importe_final = importe_final;

            // Fetch details for commission split
            const { data: offerData } = await supabase
                .from('ofertas')
                .select('propiedad_id, comprador_id, tipo_operacion, agente_id, propiedades(vendedor_id, comision_pactada)')
                .eq('id', id)
                .single();

            const agente_cierre = offerData.agente_id;
            const agente_captacion = offerData.propiedades?.vendedor_id;
            const comision_total = offerData.propiedades?.comision_pactada || (importe_final * 0.03);

            updates.comision_agente = comision_total; // Save total to offer record

            // Fetch Dynamic Splits from config_global
            const { data: configData } = await supabase
                .from('config_global')
                .select('clave, valor')
                .in('clave', ['split_captador', 'split_closer', 'split_empresa']);

            const config = {};
            configData.forEach(c => { config[c.clave] = parseFloat(c.valor) || 0; });

            const p_captador = config.split_captador || 40;
            const p_closer = config.split_closer || 40;

            const splitCaptacion = (comision_total * p_captador) / 100;
            const splitCierre = (comision_total * p_closer) / 100;

            const commRecords = [];

            if (agente_cierre === agente_captacion) {
                // If the same agent did both, they get both splits
                commRecords.push({
                    agente_id: agente_cierre,
                    oferta_id: id,
                    monto: splitCaptacion + splitCierre,
                    rol_en_operacion: 'ambos',
                    estado: 'pendiente_pago'
                });
            } else {
                if (agente_cierre) commRecords.push({
                    agente_id: agente_cierre,
                    oferta_id: id,
                    monto: splitCierre,
                    rol_en_operacion: 'cierre',
                    estado: 'pendiente_pago'
                });
                if (agente_captacion) commRecords.push({
                    agente_id: agente_captacion,
                    oferta_id: id,
                    monto: splitCaptacion,
                    rol_en_operacion: 'captacion',
                    estado: 'pendiente_pago'
                });
            }

            if (commRecords.length > 0) {
                await supabase.from('comisiones').insert(commRecords);
            }

            // Auto-transition property to "vendida_pendiente_archivo"
            const propEstado = offerData.tipo_operacion === 'alquiler' ? 'alquilada_pendiente_archivo' : 'vendida_pendiente_archivo';
            await supabase.from('propiedades')
                .update({ estado: propEstado, fecha_estado: new Date().toISOString() })
                .eq('id', offerData.propiedad_id);

            // Heat Score: +10 for buyer (completed deal)
            if (offerData.comprador_id) {
                const { data: buyer } = await supabase.from('clientes').select('heat_score').eq('id', offerData.comprador_id).single();
                await supabase.from('clientes').update({ heat_score: Math.min(100, (buyer?.heat_score || 0) + 10) }).eq('id', offerData.comprador_id);
                await supabase.from('timeline_cliente').insert([{
                    cliente_id: offerData.comprador_id,
                    tipo: 'oferta',
                    descripcion: `🎉 Operación cerrada por ${Number(importe_final).toLocaleString('es-ES')} €`,
                    metadata: { oferta_id: id, importe_final }
                }]);
            }

            await fireRules('cierre_exitoso', {
                agente_id: req.user.id,
                cliente_id: offerData.comprador_id,
                entidad_id: id,
                importe: importe_final,
                propiedad_id: offerData.propiedad_id
            });
        }

        const { data: oferta, error } = await supabase
            .from('ofertas').update(updates).eq('id', id).select().single();

        if (error) throw error;

        // Notify relevant parties based on status
        if (estado === 'negociacion') {
            const { data: prop } = await supabase
                .from('propiedades')
                .select('vendedor_id, direccion')
                .eq('id', updates.propiedad_id || 0) // fallback if not in updates
                .single();

            // If prop info not in updates, we might need a more robust fetch
            const finalProp = prop || (await supabase.from('ofertas').select('propiedades(vendedor_id, direccion)').eq('id', id).single()).data?.propiedades;

            if (finalProp?.vendedor_id) {
                await crearInterno(
                    finalProp.vendedor_id,
                    'Propuesta de Negociación 📥',
                    `Tu agente ha presentado una oferta para "${finalProp.direccion}". Revisa los detalles en tu panel.`,
                    'info',
                    { oferta_id: id }
                );
            }
        }

        res.json({ message: `Estado cambiado a "${STAGES[estado].label}"`, oferta });
    } catch (error) {
        console.error('Change Estado Error:', error);
        res.status(500).json({ error: 'Error al cambiar el estado' });
    }
};

// === ADD COUNTEROFFER ===
exports.addContraoferta = async (req, res) => {
    try {
        const { id } = req.params;
        const { importe, parte, notas } = req.body; // parte: 'comprador' | 'vendedor'

        if (!importe || !parte) {
            return res.status(400).json({ error: 'importe y parte son obligatorios' });
        }

        const { data: contraoferta, error } = await supabase
            .from('contraofertas')
            .insert([{ oferta_id: id, importe, parte, notas: notas || '' }])
            .select()
            .single();

        if (error) throw error;

        // Auto-advance to 'negociacion' if still at 'enviada'
        const { data: oferta } = await supabase.from('ofertas').select('estado, comprador_id').eq('id', id).single();
        if (oferta.estado === 'enviada') {
            await supabase.from('ofertas').update({ estado: 'negociacion', probabilidad: STAGES['negociacion'].prob }).eq('id', id);
        }

        res.status(201).json({ message: 'Contraoferta registrada', contraoferta });
    } catch (error) {
        console.error('Add Contraoferta Error:', error);
        res.status(500).json({ error: 'Error al registrar contraoferta' });
    }
};

// === STATISTICS ===
exports.getEstadisticas = async (req, res) => {
    try {
        const { data: ofertas, error } = await supabase
            .from('ofertas')
            .select('estado, importe_final, comision_agente, tipo_operacion, created_at');

        if (error) throw error;

        const stats = {
            total: ofertas.length,
            cerradas: ofertas.filter(o => o.estado === 'cerrada_exitosa').length,
            conversion_rate: 0,
            volumen_total: 0,
            comisiones_total: 0,
            por_estado: {}
        };

        ofertas.forEach(o => {
            stats.por_estado[o.estado] = (stats.por_estado[o.estado] || 0) + 1;
            if (o.estado === 'cerrada_exitosa') {
                stats.volumen_total += parseFloat(o.importe_final || 0);
                stats.comisiones_total += parseFloat(o.comision_agente || 0);
            }
        });

        stats.conversion_rate = stats.total > 0 ? ((stats.cerradas / stats.total) * 100).toFixed(1) : 0;

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};
