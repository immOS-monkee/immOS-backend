const supabase = require('../config/supabase');
const { fireRules } = require('./automatizacionesController');

// === CREATE ===
exports.createPropiedad = async (req, res) => {
    try {
        const agente_id = req.user.id;
        const {
            direccion, tipo_propiedad, operacion,
            precio_venta, precio_alquiler, caracteristicas,
            coordenadas, vendedor_id, captacion_id,
            images
        } = req.body;

        if (!direccion || !tipo_propiedad || !operacion) {
            return res.status(400).json({ error: 'Faltan campos obligatorios: direccion, tipo_propiedad, operacion' });
        }

        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .insert([{
                agente_id,
                vendedor_id: vendedor_id || null,
                direccion,
                tipo_propiedad,
                operacion,
                precio_venta: precio_venta || null,
                precio_alquiler: precio_alquiler || null,
                caracteristicas: caracteristicas || {},
                estado: 'disponible'
            }])
            .select()
            .single();

        if (error) throw error;

        // If converted from a capture, update captacion status
        if (captacion_id) {
            await supabase
                .from('captaciones_campo')
                .update({ status: 'convertida' })
                .eq('id', captacion_id);
        }

        if (images && images.length > 0) {
            const mediaRecords = images.map((url, idx) => ({
                propiedad_id: propiedad.id,
                url,
                tipo: 'foto',
                orden: idx,
                es_principal: idx === 0
            }));

            await supabase.from('multimedia_propiedad').insert(mediaRecords);
        }

        res.status(201).json({ message: 'Propiedad creada', propiedad });
    } catch (error) {
        console.error('Create Propiedad Error:', error);
        res.status(500).json({ error: error.message || error.details || 'Error interno de base de datos' });
    }
};

// === LIST ===
exports.getPropiedades = async (req, res) => {
    try {
        const { estado, tipo, operacion, agente_id: filterAgent } = req.query;
        const rol = req.user.rol;
        const userId = req.user.id;

        let query = supabase.from('propiedades').select('*, multimedia_propiedad(url, orden, es_principal, tipo)');

        // Role-based visibility (Surgical Intervention)
        if (rol === 'agente_captacion') {
            query = query.eq('agente_id', userId);
        } else if (rol === 'propietario') {
            // Bridge: Find cliente ID by user email
            const { data: cliente } = await supabase
                .from('clientes')
                .select('id')
                .eq('email', req.user.email || '')
                .single();

            if (cliente) {
                query = query.eq('vendedor_id', cliente.id);
            } else {
                // Return no results if bridge fails
                return res.json([]);
            }
        } else if (rol === 'comprador') {
            // Buyers only see available properties
            query = query.eq('estado', 'disponible');
        }
        if (filterAgent) query = query.eq('agente_id', filterAgent);
        if (estado) query = query.eq('estado', estado);
        if (tipo) query = query.eq('tipo_propiedad', tipo);
        if (operacion) query = query.eq('operacion', operacion);

        query = query.order('created_at', { ascending: false });

        const { data: propiedades, error } = await query;
        if (error) throw error;

        res.json(propiedades);
    } catch (error) {
        console.error('List Propiedades Error:', error);
        res.status(500).json({ error: 'Error al listar propiedades' });
    }
};

// === DETAIL ===
exports.getPropiedad = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .select('*, multimedia_propiedad(*)')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!propiedad) return res.status(404).json({ error: 'Propiedad no encontrada' });

        res.json(propiedad);
    } catch (error) {
        console.error('Get Propiedad Error:', error);
        res.status(500).json({ error: 'Error al obtener la propiedad' });
    }
};

// === UPDATE ===
exports.updatePropiedad = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        delete updates.id;
        delete updates.agente_id; // Can't change agent via this endpoint
        updates.updated_at = new Date().toISOString();

        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ message: 'Propiedad actualizada', propiedad });
    } catch (error) {
        console.error('Update Propiedad Error:', error);
        res.status(500).json({ error: 'Error al actualizar la propiedad' });
    }
};

// === CHANGE STATE ===
exports.changeEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const validStates = ['disponible', 'reservada', 'vendida_pendiente_archivo', 'vendida_archivada', 'alquilada_pendiente_archivo', 'alquilada_archivada', 'inactiva', 'oculta'];
        if (!validStates.includes(estado)) {
            return res.status(400).json({ error: 'Estado no válido' });
        }

        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .update({ estado, fecha_estado: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Module 10: Automatizaciones
        if (estado === 'disponible') await fireRules('propiedad_disponible', { entidad_id: id, direccion: propiedad.direccion });
        if (estado === 'reservada') await fireRules('propiedad_reservada', { entidad_id: id, direccion: propiedad.direccion });

        res.json({ message: `Estado cambiado a ${estado}`, propiedad });
    } catch (error) {
        console.error('Change Estado Error:', error);
        res.status(500).json({ error: 'Error al cambiar el estado' });
    }
};

// === CONVERT CAPTACION → PROPIEDAD ===
exports.convertFromCaptacion = async (req, res) => {
    try {
        const { captacion_id } = req.params;
        const agente_id = req.user.id;

        // Fetch the captacion
        const { data: captacion, error: captError } = await supabase
            .from('captaciones_campo')
            .select('*')
            .eq('id', captacion_id)
            .single();

        if (captError || !captacion) return res.status(404).json({ error: 'Captación no encontrada' });

        const d = captacion.data;

        // Build new property from capture data
        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .insert([{
                agente_id,
                direccion: d.address || 'Sin dirección',
                tipo_propiedad: d.type || 'piso',
                operacion: d.operation || 'venta',
                precio_venta: d.operation === 'venta' ? (d.price || null) : null,
                precio_alquiler: d.operation === 'alquiler' ? (d.price || null) : null,
                caracteristicas: d.characteristics || {},
                estado: 'disponible'
            }])
            .select()
            .single();

        if (error) throw error;

        // Upload images from base64 in capture (store as multimedia)
        if (d.images && d.images.length > 0) {
            const mediaRecords = d.images.map((url, idx) => ({
                propiedad_id: propiedad.id,
                url,
                tipo: 'foto',
                orden: idx,
                es_principal: idx === 0
            }));

            await supabase.from('multimedia_propiedad').insert(mediaRecords);
        }

        // Mark captacion as converted
        await supabase
            .from('captaciones_campo')
            .update({ status: 'convertida' })
            .eq('id', captacion_id);

        res.status(201).json({ message: 'Captación convertida a propiedad', propiedad });
    } catch (error) {
        console.error('Convert Captacion Error:', error);
        res.status(500).json({ error: 'Error al convertir la captación' });
    }
};

// === DELETE ===
exports.deletePropiedad = async (req, res) => {
    try {
        const { id } = req.params;

        // Solo permitir borrar al creador (agente) o a un super_admin/admin si existiera esa validación, 
        // pero por ahora el token nos dice quién es. Podríamos checar roles aquí.
        const rol = req.user.rol;

        // Verificar si existe la propiedad
        const { data: propiedad, error: fetchError } = await supabase
            .from('propiedades')
            .select('agente_id')
            .eq('id', id)
            .single();

        if (fetchError || !propiedad) {
            return res.status(404).json({ error: 'Propiedad no encontrada' });
        }

        // Si es agente_captacion, solo puede borrar suyas; super_admin puede todas.
        if (rol === 'agente_captacion' && propiedad.agente_id !== req.user.id) {
            return res.status(403).json({ error: 'No autorizado para borrar esta propiedad' });
        }

        const { error: deleteError } = await supabase
            .from('propiedades')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({ message: 'Propiedad eliminada correctamente' });
    } catch (error) {
        console.error('Delete Propiedad Error:', error);
        res.status(500).json({ error: error.message || 'Error al eliminar la propiedad' });
    }
};
// === PUBLIC DETAIL (For Landing Pages / Promo) ===
exports.getPropiedadPublica = async (req, res) => {
    try {
        const { id } = req.params;

        // Solo traemos datos no sensibles
        const { data: propiedad, error } = await supabase
            .from('propiedades')
            .select(`
                id, direccion, tipo_propiedad, operacion, 
                precio_venta, precio_alquiler, caracteristicas, 
                descripcion,
                multimedia_propiedad(*)
            `)
            .eq('id', id)
            .eq('estado', 'disponible') // Solo casas a la venta/alquiler
            .single();

        if (error) throw error;
        if (!propiedad) return res.status(404).json({ error: 'Propiedad no disponible o no encontrada' });

        res.json(propiedad);
    } catch (error) {
        console.error('Get Public Propiedad Error:', error);
        res.status(500).json({ error: 'Error al obtener datos públicos de la propiedad' });
    }
};
