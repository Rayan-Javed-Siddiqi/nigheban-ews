import geopandas as gpd

gdf = gpd.read_file("data/boundaries/pak_admin2.shp")

# Make sure coordinates are in WGS84 (lat/lon) — required for our PostGIS column
gdf = gdf.to_crs(epsg=4326)

# Filter to KP (PK5xx) and GB (PK3xx) districts only
kp_gb = gdf[gdf["adm1_pcode"].isin(["PK5", "PK3"])].copy()

print(f"Found {len(kp_gb)} districts in KP + GB")
print(kp_gb[["adm2_name", "adm1_pcode", "adm2_pcode"]].to_string())

def province_of(pcode):
    return "KP" if pcode == "PK5" else "GB"

# Build SQL insert statements
sql_lines = []
for _, row in kp_gb.iterrows():
    name = row["adm2_name"].replace("'", "''")
    pcode = row["adm2_pcode"]
    province = province_of(row["adm1_pcode"])
    geojson = row["geometry"].__geo_interface__
    import json
    geom_json = json.dumps(geojson).replace("'", "''")

    sql_lines.append(
        f"insert into district (adm2_code, name_en, province, geom) "
        f"values ('{pcode}', '{name}', '{province}', "
        f"ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('{geom_json}'), 4326)));"
    )

with open("scripts/insert_districts.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(sql_lines))

print(f"\nWrote {len(sql_lines)} insert statements to scripts/insert_districts.sql")