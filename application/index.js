"use strict";

import localforage from "localforage";

import m from "mithril";
import { v4 as uuidv4 } from "uuid";
import L from "leaflet";
import dayjs from "dayjs";

import "swiped-events";
import markerIcon from "./assets/css/images/marker-icon.png";
import markerIconRetina from "./assets/css/images/marker-icon-2x.png";
import "font-awesome/css/font-awesome.min.css";

let share_url = async (data) => {
  try {
    await navigator.share(data);
    resultPara.textContent = "shared successfully";
  } catch (err) {
    resultPara.textContent = `Error: ${err}`;
  }
};
const intro = document.getElementById("intro");

setTimeout(() => {
  intro.style.display = "none";
}, 8000);

document.addEventListener("DOMContentLoaded", function (e) {
  function getReferencePointFromURL() {
    let lat = 47.132344;
    let lng = 7.244604;

    const hash = window.location.hash;
    const queryStart = hash.indexOf("?");
    if (queryStart !== -1) {
      const query = hash.substring(queryStart);
      const params = new URLSearchParams(query);
      lat = parseFloat(params.get("lat")) || lat;
      lng = parseFloat(params.get("lng")) || lng;
    }

    localStorage.setItem("lat", lat);
    localStorage.setItem("lng", lng);

    return L.latLng(lat, lng);
  }

  const referencePoint = getReferencePointFromURL();

  let categories = ["All"];

  let TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  TWO_HOURS_MS = 1000;

  var Data = {
    onremove: () => {},
    oninit: () => {},
    todos: {
      list: null,
      error: "",
      fetch: async function () {
        try {
          const lastUpdated = await localforage.getItem("data_updated");
          const now = Date.now();

          if (lastUpdated) {
            const age = now - new Date(lastUpdated).getTime();
            if (age < TWO_HOURS_MS) {
              const cachedData = await localforage.getItem("data");
              if (cachedData) {
                Data.todos.list = cachedData;
                categories = await localforage.getItem(
                  "categories",
                  categories
                );

                return;
              }
            }
          }

          // Neu laden
          const items = await m.request({
            method: "GET",
            url: "https://yellow-base-40e2.strukturart.workers.dev/",
          });

          Data.todos.list = items.events.filter((e) => {
            return e.address_latlng != null;
          });

          Data.todos.list.forEach((e) => {
            const latlng = L.latLng(e.address_latlng.lat, e.address_latlng.lng);
            const d = latlng.distanceTo(referencePoint);
            e.distance = d;
            e.prettyDistance =
              d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m";

            //get categories
            let allLabels = [];

            Data.todos.list.forEach((e) => {
              allLabels.push(...e.event_categories_labels); // alle Labels sammeln
            });

            allLabels.forEach((label) => {
              const trimmed = label.trim(); // falls nötig
              if (!categories.includes(trimmed)) {
                categories.push(trimmed);
              }
            });
          });

          Data.todos.list.sort((a, b) => a.distance - b.distance);

          await localforage.setItem("data", Data.todos.list);
          await localforage.setItem("categories", categories);

          await localforage.setItem("data_updated", new Date());
        } catch (e) {
          Data.todos.error = e.message;
        }
      },
    },
  };

  let filter = "";

  var events = {
    oninit: () => {
      Data.todos.fetch();
    },

    view: function (vnode) {
      if (Data.todos.error) {
        return m(".error", Data.todos.error);
      }

      if (!Data.todos.list) {
        return m(".loading-icon");
      }
      return m("div", [
        m(
          "button",
          {
            id: "filter-reset",
            onclick: (vnode) => {
              document.querySelector("#filter-reset").style.display = "none";

              document.querySelector("#filter-list").style.position =
                "relative";
              document.querySelector("#filter-list").style.height = "auto";
            },

            oncreate: () => {
              // Wenn schon besucht, sofort verstecken
              if (sessionStorage.getItem("visited") == "1") {
                intro.style.display = "none";
              } else {
                setTimeout(() => {
                  intro?.classList.add("hide");
                }, 1000);
              }
            },
          },
          "Filter"
        ),

        m(
          "div",
          { id: "filter-list", class: "row" },
          categories.map(function (item) {
            return m(
              "button",
              {
                class: "filter-list-button",
                onclick: (e) => {
                  filter = item;
                  m.redraw();

                  document.querySelector("#filter-reset").style.display =
                    "block";

                  document.querySelector("#filter-list").style.position =
                    "fixed";
                  document.querySelector("#filter-list").style.height = "0px";
                },
              },
              item
            );
          })
        ),

        m(
          "div",
          { class: "row between-md" },
          Data.todos.list.map(function (item) {
            if (
              filter != "All" &&
              filter != "" &&
              !item.event_categories_labels.includes(filter)
            )
              return;

            return m("article", { class: "debug col-xs-12 col-md-4" }, [
              m("h2", item.venue_name),
              m("div", item.event_title),
              m(
                "div",
                dayjs(item.event_dates[0].start_date).format("DD.MM.YY HH:mm")
              ),
              m("div", item.prettyDistance),
              m("img", { src: item.image_url, loading: "lazy" }),

              m("div", { class: "action-buttons row" }, [
                m(
                  "a",
                  {
                    href:
                      "#!/map?lat=" +
                      item.address_latlng.lat +
                      "&lng=" +
                      item.address_latlng.lng,
                  },
                  [
                    m("i", {
                      class: "col-xs-2 fa fa-map fa-2x",
                      "aria-hidden": "true",
                    }),
                  ]
                ),
                m("a", { href: item.culturoscope_url, target: "_blank" }, [
                  m("i", {
                    class: "col-xs-2 fa fa-external-link fa-2x",
                    "aria-hidden": "true",
                  }),
                ]),
                m(
                  "a",
                  {
                    oncreate: (vnode) => {
                      if (!navigator.share) {
                        vnode.dom.style.display = "none";
                      }
                    },
                    onclick: () => {
                      share_url({
                        title: "Culturoscope",
                        text: "Culturoscope",
                        url: item.culturoscope_url,
                      });
                    },
                  },
                  [
                    m("i", {
                      class: "col-xs-2 fa fa-share-square fa-2x",
                      "aria-hidden": "true",
                    }),
                  ]
                ),
              ]),
            ]);
          })
        ),
      ]);
    },
  };

  let map_container;
  var map = {
    oninit: () => {
      console.log(getReferencePointFromURL());
    },
    onremove: () => {
      map_container = null;
    },
    view: () => {
      return m("div", {
        id: "map-container",
        class: "",
        oncreate: () => {
          let a = getReferencePointFromURL();
          let latlng_url = [a.lat, a.lng];
          map_container = L.map("map-container", {
            keyboard: true,
            zoomControl: false,
          }).setView(latlng_url, 16);

          L.Icon.Default.prototype.options.shadowUrl = "";
          L.Icon.Default.prototype.options.iconUrl = markerIcon;
          L.Icon.Default.prototype.options.iconRetinaUrl = markerIconRetina;

          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }).addTo(map_container);

          Data.todos.list.map((e) => {
            let marker = L.marker([
              e.address_latlng.lat,
              e.address_latlng.lng,
            ]).addTo(map_container);
            marker.bindTooltip(e.venue_name);

            const center = map_container.getCenter();
            const markerLatLng = marker.getLatLng();

            if (
              center.lat === markerLatLng.lat &&
              center.lng === markerLatLng.lng
            ) {
              marker.openTooltip();
            }
          });
        },
      });
    },
  };
  var about = {
    view: () => {
      return m("div", { class: "row center-xs", id: "about" }, [
        m("div", { class: "col-xs-12 col-md-7 text" }, [
          m.trust(
            "Diese Website zeigt dir, welche Veranstaltungen in der Nähe eines der 'Kultursäulen' der Stadt Biel/Bienne stattfinden.Sie wurde im Rahmen des Projekts <a href='https://spotin.ch' target:'_blank'>Spotin</a> erstellt, das von der Stadt Biel/Bienne initiiert wurde.Die Veranstaltungsdaten werden freundlicherweise von CultuScope zur Verfügung gestellt."
          ),

          m.trust(
            "<br><br>Ce site vous permet de découvrir les événements qui ont lieu à proximité de l’un des piliers culturels de la ville de Bienne. Il a été réalisé dans le cadre du projet Spotin, une initiative de la Ville de Bienne.Les données des événements sont gracieusement fournies par CultuScope"
          ),
          m.trust("<br><br><strong>Links</strong><br>"),
          m("ul", [
            m("li", [m("a", { href: "https://spotin.ch" }, "spotin.ch")]),
            m("li", [
              m(
                "a",
                { href: "https://www.culturoscope.ch/agenda" },
                "culturoscope.ch/agenda"
              ),
            ]),
            m("li", [
              m(
                "a",
                {
                  href: "https://www.velokurierbiel.ch/de/service-plus/plakatservice",
                },
                "Kultursäulen"
              ),
            ]),
          ]),
        ]),
      ]);
    },
  };

  let root = document.getElementById("app");

  m.route(root, "/events", {
    "/events": events,
    "/map": map,
    "/about": about,
  });
});
