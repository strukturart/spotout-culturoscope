export default {
  async fetch(request, env, ctx) {

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }


    

    const apiUrl = "https://www.culturoscope.ch/api/2.0/events.php?api_key="+env.API_KEY;

    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        return new Response("Upstream error", {
          status: res.status,
          headers: {
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      const data = await res.json();

      const events = Array.isArray(data.events) ? data.events : [];

      const enriched = await Promise.all(events.map(async (event) => {
        const { venue_zip, venue_city, venue_address } = event;

        if (!venue_zip || !venue_city || !venue_address) {
          event.address_latlng = null;
          return event;
        }

        const searchText = encodeURIComponent(`${venue_zip},${venue_city},${venue_address}`);
        const geoUrl = `https://api3.geo.admin.ch/rest/services/api/SearchServer?lang=de&type=locations&searchText=${searchText}`;

        try {
          const geoRes = await fetch(geoUrl);
          const geoData = await geoRes.json();

          if (geoData.results?.length > 0) {
            console.log(geoData)
            const pos = geoData.results[0].attrs;
            event.address_latlng = {
              lat: parseFloat(pos.lat),
              lng: parseFloat(pos.lon),
            };
          } else {
            event.address_latlng = null;
          }
        } catch (e) {
          event.address_latlng = null;
        }

        return event;
      }));

      const response = {
        ...data,
        events: enriched,
      };

      return new Response(JSON.stringify(response), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });

    } catch (err) {
      return new Response("Fetch failed: " + err.message, {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },
};
