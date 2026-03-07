const supabase = require('../config/supabase');

// === ALQUILERES ===

exports.createAlquiler = async (req, res) => {
    try {
        const {
            propiedad_id, inquilino_id, vendedor_id,
            monto_mensual, dia_pago, fecha_inicio, fecha_fin
        } = req.body;
        const agente_id = req.user.id;

        const { data: alquiler, error } = await supabase
            .from('alquileres')
            .insert([{
                propiedad_id, inquilino_id, vendedor_id,
                agente_id, monto_mensual, dia_pago,
                fecha_inicio, fecha_fin, estado: 'activo'
            }])
            .select()
            .single();

        if (error) throw error;

        // Automatically update property status to 'alquilada_pendiente_archivo'
        await supabase
            .from('propiedades')
            .update({ estado: 'alquilada_pendiente_archivo', fecha_estado: new Date() })
            .eq('id', propiedad_id);

        res.status(201).json({ message: 'Contrato de alquiler creado', alquiler });
    } catch (error) {
        console.error('Create Alquiler Error:', error);
        res.status(500).json({ error: 'Error al crear contrato de alquiler' });
    }
};

exports.getAlquileres = async (req, res) => {
    try {
        const rol = req.user.rol;
        const userId = req.user.id;

        let query = supabase.from('alquileres').select(`
            *,
            propiedades (direccion),
            inquilino:inquilino_id (nombre),
            vendedor:vendedor_id (nombre)
        `);

        // Role isolation
        if (rol === 'agente_cierre' || rol === 'agente_captacion') {
            query = query.eq('agente_id', userId);
        }

        const { data: alquileres, error } = await query;
        if (error) throw error;

        res.json(alquileres);
    } catch (error) {
        console.error('List Alquileres Error:', error);
        res.status(500).json({ error: 'Error al listar alquileres' });
    }
};

// === PAGOS ===

exports.registrarPago = async (req, res) => {
    try {
        const { alquiler_id, mes, anio, monto_pagado, metodo_pago } = req.body;

        const { data: pago, error } = await supabase
            .from('pagos_alquiler')
            .insert([{
                alquiler_id,
                mes,
                anio,
                monto_pagado,
                metodo_pago,
                fecha_pago: new Date(),
                estado: 'pagado'
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ message: 'Pago registrado con éxito', pago });
    } catch (error) {
        console.error('Registrar Pago Error:', error);
        res.status(500).json({ error: 'Error al registrar el pago' });
    }
};

exports.getPagosByAlquiler = async (req, res) => {
    try {
        const { alquilerId } = req.params;
        const { data: pagos, error } = await supabase
            .from('pagos_alquiler')
            .select('*')
            .eq('alquiler_id', alquilerId)
            .order('anio', { ascending: false })
            .order('mes', { ascending: false });

        if (error) throw error;
        res.json(pagos);
    } catch (error) {
        console.error('Get Pagos Error:', error);
        res.status(500).json({ error: 'Error al obtener historial de pagos' });
    }
};
