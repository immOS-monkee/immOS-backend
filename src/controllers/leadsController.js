const supabase = require('../config/supabase');
const winston = require('winston');

// 1. Recibir Lead desde el formulario público (No requiere JWT)
exports.crearLeadPublico = async (req, res) => {
    try {
        const { 
            nombre, 
            telefono, 
            descripcion_busqueda, 
            zona_interes, 
            origen, 
            propiedad_titular_id,
            tipo_lead,
            fecha_visita,
            hora_visita 
        } = req.body;

        if (!nombre || !telefono) {
            return res.status(400).json({ error: 'Nombre y WhatsApp son obligatorios' });
        }

        const { data, error } = await supabase
            .from('leads_web')
            .insert([{
                nombre,
                telefono,
                descripcion_busqueda,
                zona_interes,
                origen: origen || 'Otro',
                propiedad_titular_id: propiedad_titular_id || null,
                tipo_lead: tipo_lead || 'asesoria',
                fecha_visita: fecha_visita || null,
                hora_visita: hora_visita || null,
                estado: 'nuevo'
            }])
            .select();

        if (error) throw error;
        const newLead = data[0];
        const notificacionController = require('./notificacionController');

        // NOTIFICACIÓN QUIRÚRGICA: Avisar a los Super Admins
        try {
            const { data: admins } = await supabase
                .from('usuarios')
                .select('id')
                .eq('rol', 'super_admin')
                .eq('activo', true);

            if (admins && admins.length > 0) {
                const promesas = admins.map(admin => 
                    notificacionController.crearInterno(
                        admin.id,
                        '🎯 ¡Nuevo Lead recibido!',
                        `Prospecto: ${nombre}. Fuente: ${origen || 'Web'}.`,
                        'lead',
                        { lead_id: newLead.id }
                    )
                );
                await Promise.all(promesas);
            }
        } catch (notifErr) {
            winston.error('Error enviando notificaciones de lead:', notifErr);
        }

        return res.status(201).json({
            success: true,
            message: 'Lead registrado correctamente, contacto en breve.',
            lead: data[0]
        });

    } catch (err) {
        winston.error('Error al crear Lead Público:', err);
        return res.status(500).json({ error: 'Fallo al procesar el formulario de contacto' });
    }
};

// 2. Obtener Leads para el Dashboard de Marketing (Requiere JWT)
exports.obtenerLeads = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('leads_web')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        winston.error('Error al obtener Leads Web:', err);
        return res.status(500).json({ error: 'Error interno de servidor' });
    }
};

// 3. Actualizar estado del Lead (Contactado, Convertido, etc)
exports.actualizarEstadoLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, asignado_a, resultado_gestion, notas_agente } = req.body;

        const { data, error } = await supabase
            .from('leads_web')
            .update({ 
                estado, 
                asignado_a, 
                resultado_gestion, 
                notas_agente,
                updated_at: new Date() 
            })
            .eq('id', id)
            .select();

        if (error) throw error;
        return res.json(data[0]);
    } catch (err) {
        winston.error('Error al actualizar estado Lead:', err);
        return res.status(500).json({ error: 'Error interno de servidor' });
    }
};
// 4. Convertir Lead en Cliente y crear registro de Visita
exports.convertirLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { asignado_a } = req.body;

        // 1. Obtener datos del lead
        const { data: lead, error: leadErr } = await supabase
            .from('leads_web')
            .select('*')
            .eq('id', id)
            .single();

        if (leadErr || !lead) throw new Error('Lead no encontrado');

        // 2. Crear Cliente (CRM)
        const { data: cliente, error: cliErr } = await supabase
            .from('clientes')
            .insert([{
                nombre: lead.nombre,
                telefono: lead.telefono,
                origen: 'web',
                created_by: asignado_a
            }])
            .select()
            .single();

        if (cliErr) throw cliErr;

        // 3. Si es tipo visita, crear registro en la tabla de visitas
        if (lead.tipo_lead === 'visita' && lead.propiedad_titular_id) {
            // Combinar fecha y hora para TIMESTAMP
            const fechaCompuesta = `${lead.fecha_visita}T${lead.hora_visita ? lead.hora_visita : '00:00:00'}`;
            
            winston.info(`Agendando visita automática para cliente ${cliente.id} en propiedad ${lead.propiedad_titular_id}`);
            
            const { error: visErr } = await supabase
                .from('visitas')
                .insert([{
                    propiedad_id: lead.propiedad_titular_id,
                    agente_id: asignado_a,
                    comprador_id: cliente.id,
                    fecha_programada: fechaCompuesta,
                    estado: 'confirmada'
                }]);
            
            if (visErr) winston.error('Error insertando visita automática:', visErr);
        }

        // 4. Actualizar Lead como Convertido
        const { data: updatedLead, error: upErr } = await supabase
            .from('leads_web')
            .update({ 
                estado: 'convertido',
                resultado_gestion: 'confirmada',
                notas_agente: `Convertido a cliente y visita agendanda por el Admin`,
                updated_at: new Date() 
            })
            .eq('id', id)
            .select()
            .single();

        if (upErr) throw upErr;

        return res.json({
            success: true,
            message: 'Lead convertido a Cliente con éxito',
            lead: updatedLead,
            cliente_id: cliente.id
        });

    } catch (err) {
        winston.error('Error en convertirLead:', err);
        return res.status(500).json({ error: err.message || 'Error al procesar la conversión' });
    }
};
