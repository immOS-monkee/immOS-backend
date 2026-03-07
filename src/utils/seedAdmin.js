const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');
require('dotenv').config();

const seedAdmin = async () => {
    const email = 'admin@inmoos.com';
    const password = 'admin_password_123';
    const nombre = 'Super Admin InmoOS';
    const rol = 'super_admin';

    console.log('--- Iniciando Seeding de Super Admin ---');

    try {
        // 1. Hash the password
        const passwordHash = await bcrypt.hash(password, 10);

        // 2. Insert into Supabase
        const { data, error } = await supabase
            .from('usuarios')
            .insert([
                {
                    email,
                    password_hash: passwordHash,
                    nombre,
                    rol,
                    activo: true
                }
            ])
            .select();

        if (error) {
            if (error.code === '23505') {
                console.log('✅ El Super Admin ya existe en la base de datos.');
            } else {
                throw error;
            }
        } else {
            console.log('✅ Super Admin creado con éxito:');
            console.log(`Email: ${email}`);
            console.log(`Password: ${password}`);
        }

    } catch (error) {
        console.error('❌ Error fatal al crear el Admin:', error.message);
    } finally {
        process.exit();
    }
};

seedAdmin();
