const Joi = require('joi');

const authSchemas = {
    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required()
    })
};

const ofertaSchemas = {
    create: Joi.object({
        propiedad_id: Joi.string().uuid().required(),
        comprador_id: Joi.string().uuid().required(),
        importe_ofertado: Joi.number().positive().required(),
        tipo_operacion: Joi.string().valid('venta', 'alquiler').required(),
        notas: Joi.string().allow('', null)
    }),
    changeStatus: Joi.object({
        estado: Joi.string().valid('negociacion', 'aceptada', 'arras_firmadas', 'cerrada_exitosa', 'cancelada', 'rechazada').required(),
        importe_final: Joi.number().positive().optional()
    })
};

module.exports = { authSchemas, ofertaSchemas };
