#!/usr/bin/env python3
"""
WP-10 content extraction: reads the offline zetagroup.ph MySQL dump (gzip) and writes the content the
platform migrates as one JSON file. Code only — the dump and the JSON stay local (client content,
never committed). Run with -I so nothing next to the dump is imported:

    python3 -I apps/cms/scripts/wp-extract.py ~/Projects/zeta-group/_db/<dump>.sql.gz .local/wp-export.json

Published records of: post, shorts, location, directory, testimonial, shortlist; their categories,
featured images (as paths under wp-content/uploads) and the postmeta the platform uses.
"""
import gzip
import html
import json
import sys

POST_COLS = ['ID', 'post_author', 'post_date', 'post_date_gmt', 'post_content', 'post_title', 'post_excerpt', 'post_status',
             'comment_status', 'ping_status', 'post_password', 'post_name', 'to_ping', 'pinged', 'post_modified', 'post_modified_gmt',
             'post_content_filtered', 'post_parent', 'guid', 'menu_order', 'post_type', 'post_mime_type', 'comment_count']
TYPES = {'post', 'shorts', 'location', 'directory', 'testimonial', 'shortlist'}
META_KEYS = {
    '_thumbnail_id', '_wp_attached_file', '_wp_attachment_image_alt', '_yoast_wpseo_title', '_yoast_wpseo_metadesc',
    '_yoast_wpseo_primary_category', '_respacio_province_muni_town_complex_name', '_respacio_province_muni_town_complex_level',
    '_respacio_location_name', '_respacio_location_add_lat_id', '_respacio_location_add_long_id', 'video_url', 'logo',
    'excerpt', '_wp_page_template', '_respacio_multi_location',
}


def parse_values(s, i):
    """MySQL extended-INSERT values → rows (handles quoting and backslash escapes)."""
    rows, n = [], len(s)
    while i < n:
        while i < n and s[i] in ' ,\n':
            i += 1
        if i >= n or s[i] == ';':
            break
        i += 1
        row = []
        while True:
            if s[i] == "'":
                i += 1
                buf = []
                while True:
                    c = s[i]
                    if c == '\\':
                        nx = s[i + 1]
                        buf.append({'n': '\n', 'r': '\r', 't': '\t', '0': '\0', 'Z': '\x1a'}.get(nx, nx))
                        i += 2
                    elif c == "'":
                        if s[i + 1] == "'":
                            buf.append("'")
                            i += 2
                        else:
                            i += 1
                            break
                    else:
                        j = i
                        while s[j] not in "\\'":
                            j += 1
                        buf.append(s[i:j])
                        i = j
                row.append(''.join(buf))
            else:
                j = i
                while s[j] not in ',)':
                    j += 1
                v = s[i:j].strip()
                row.append(None if v == 'NULL' else v)
                i = j
            if s[i] == ',':
                i += 1
                continue
            if s[i] == ')':
                i += 1
                break
        rows.append(row)
    return rows


def tables(path, names):
    out = {n: [] for n in names}
    with gzip.open(path, 'rt', encoding='utf-8', errors='surrogateescape') as f:
        for line in f:
            for n in names:
                if line.startswith(f'INSERT INTO `{n}`'):
                    out[n] += parse_values(line, line.index(' VALUES ') + 8)
    return out


def main(dump, out_path):
    t = tables(dump, ['wp_posts', 'wp_postmeta', 'wp_terms', 'wp_term_taxonomy', 'wp_term_relationships'])
    posts = {r[0]: dict(zip(POST_COLS, r)) for r in t['wp_posts']}
    meta = {}
    for _id, pid, key, val in t['wp_postmeta']:
        if key in META_KEYS:
            meta.setdefault(pid, {})[key] = val
    terms = {r[0]: {'name': r[1], 'slug': r[2]} for r in t['wp_terms']}
    taxonomy = {r[0]: {'term': r[1], 'taxonomy': r[2], 'parent': r[4]} for r in t['wp_term_taxonomy']}
    rel = {}
    for obj, tt, _order in t['wp_term_relationships']:
        rel.setdefault(obj, []).append(tt)

    def attachment(att_id):
        a = meta.get(att_id or '', {})
        return {'file': a['_wp_attached_file'], 'alt': a.get('_wp_attachment_image_alt', '')} if a.get('_wp_attached_file') else None

    def term_list(pid, tax):
        out = []
        for tt in rel.get(pid, []):
            x = taxonomy.get(tt)
            if x and x['taxonomy'] == tax:
                out.append(x['term'])
        return out

    def base(p):
        m = meta.get(p['ID'], {})
        return {
            'wpId': int(p['ID']), 'title': html.unescape(p['post_title']), 'slug': p['post_name'], 'date': p['post_date_gmt'] or p['post_date'],
            'content': p['post_content'], 'excerpt': html.unescape(p['post_excerpt'] or ''), 'parent': int(p['post_parent'] or 0),
            'thumb': attachment(m.get('_thumbnail_id')), 'seoTitle': m.get('_yoast_wpseo_title'), 'seoDescription': m.get('_yoast_wpseo_metadesc'),
        }

    export = {k: [] for k in ['posts', 'shorts', 'locations', 'directory', 'testimonials', 'shortlists']}
    for p in posts.values():
        if p['post_status'] != 'publish' or p['post_type'] not in TYPES:
            continue
        m = meta.get(p['ID'], {})
        rec = base(p)
        if p['post_type'] == 'post':
            rec |= {'categories': term_list(p['ID'], 'category'), 'tags': term_list(p['ID'], 'post_tag'),
                    'primaryCategory': m.get('_yoast_wpseo_primary_category'), 'template': m.get('_wp_page_template'),
                    'locationTree': m.get('_respacio_multi_location')}
            export['posts'].append(rec)
        elif p['post_type'] == 'shorts':
            export['shorts'].append(rec | {'videoUrl': m.get('video_url')})
        elif p['post_type'] == 'location':
            export['locations'].append(rec | {
                'geo': m.get('_respacio_province_muni_town_complex_name'), 'level': m.get('_respacio_province_muni_town_complex_level'),
                'crmName': m.get('_respacio_location_name'), 'lat': m.get('_respacio_location_add_lat_id'), 'lng': m.get('_respacio_location_add_long_id'),
            })
        elif p['post_type'] == 'directory':
            export['directory'].append(rec | {'categories': term_list(p['ID'], 'directory-category'), 'logo': attachment(m.get('logo')), 'summary': m.get('excerpt')})
        elif p['post_type'] == 'testimonial':
            export['testimonials'].append(rec | {'categories': term_list(p['ID'], 'testimonial-category')})
        elif p['post_type'] == 'shortlist':
            export['shortlists'].append(rec)

    def taxonomy_terms(tax):
        return [{'termId': x['term'], 'name': html.unescape(terms[x['term']]['name']), 'slug': terms[x['term']]['slug'], 'parent': x['parent']}
                for x in taxonomy.values() if x['taxonomy'] == tax and x['term'] in terms]

    export['categories'] = taxonomy_terms('category')
    export['tags'] = taxonomy_terms('post_tag')
    export['directoryCategories'] = taxonomy_terms('directory-category')
    export['testimonialCategories'] = taxonomy_terms('testimonial-category')
    with open(out_path, 'w') as f:
        json.dump(export, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: len(v) for k, v in export.items()}))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
