const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const querystring = require('querystring');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    // PayPal IPN sends POST requests
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const bodyText = event.body;
        const payload = querystring.parse(bodyText);

        console.log('Received IPN:', payload.txn_type);

        // Step 1: Verify IPN message directly with PayPal
        const reqBody = 'cmd=_notify-validate&' + bodyText;
        const isVerified = await new Promise((resolve, reject) => {
            const req = https.request({
                host: 'ipnpb.paypal.com', // Live PayPal IPN endpoint
                path: '/cgi-bin/webscr',
                method: 'POST',
                headers: {
                    'Content-Length': Buffer.byteLength(reqBody),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data === 'VERIFIED'));
            });
            req.on('error', reject);
            req.write(reqBody);
            req.end();
        });

        // If not verified, just ignore it and return 200 so PayPal stops retrying
        if (!isVerified) {
            console.error('IPN Verification Failed!');
            return { statusCode: 200, body: 'Unverified IPN' };
        }

        // Step 2: Process verified IPN
        const txnType = payload.txn_type;
        const email = payload.payer_email;

        // Subscriptions events: subscr_signup, subscr_payment, subscr_cancel, subscr_eot
        // Normal purchases: web_accept, cart
        
        if (!email) {
            return { statusCode: 200, body: 'No payer email found' };
        }

        if (txnType === 'subscr_signup' || txnType === 'subscr_payment' || txnType === 'web_accept') {
            console.log(`Activating access for: ${email}`);
            const { error } = await supabase
                .from('subscribers')
                .upsert({ email: email, status: 'active', updated_at: new Date().toISOString() }, { onConflict: 'email' });
            
            if (error) console.error('Supabase error:', error);
            
        } else if (txnType === 'subscr_cancel' || txnType === 'subscr_eot' || txnType === 'subscr_failed' || payload.payment_status === 'Refunded') {
            console.log(`Revoking access for: ${email}`);
            const { error } = await supabase
                .from('subscribers')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('email', email);
                
            if (error) console.error('Supabase update error:', error);
        }

        // Must always return 200 OK
        return { statusCode: 200, body: 'Success' };

    } catch (err) {
        console.error('Webhook error:', err);
        return { statusCode: 500, body: 'Server Error' };
    }
};
