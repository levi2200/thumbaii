const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { email } = JSON.parse(event.body);
        if (!email) {
            return {
                statusCode: 400,
                body: JSON.stringify({ active: false, error: 'Email is required' })
            };
        }

        console.log(`Checking access for email: ${email}`);

        const { data, error } = await supabase
            .from('subscribers')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .eq('status', 'active')
            .single();

        if (error || !data) {
            console.log(`Access denied for ${email}`);
            return {
                statusCode: 200,
                body: JSON.stringify({ active: false })
            };
        }

        console.log(`Access granted for ${email}`);
        
        // Generate a random token that the frontend will store in localStorage
        const token = Buffer.from(email + Date.now()).toString('base64');

        return {
            statusCode: 200,
            body: JSON.stringify({ active: true, token: token })
        };
    } catch (err) {
        console.error('Check access error:', err);
        return { statusCode: 500, body: JSON.stringify({ active: false, error: 'Server error' }) };
    }
};
