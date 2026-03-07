const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing connection to:', url);

const supabase = createClient(url, key);

async function test() {
    try {
        const { data, error } = await supabase.from('usuarios').select('count', { count: 'exact', head: true });
        if (error) {
            console.error('❌ Supabase Error:', error);
        } else {
            console.log('✅ Connection Successful! Found tables.');
        }
    } catch (err) {
        console.error('❌ Fetch Error:', err);
    }
}

test();
