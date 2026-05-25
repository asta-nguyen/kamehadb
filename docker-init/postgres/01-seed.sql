CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) NOT NULL,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO organizations (name, slug) VALUES
  ('Acme Inc', 'acme'),
  ('Globex Corp', 'globex');

INSERT INTO users (org_id, name, email, role) VALUES
  (1, 'Alice', 'alice@acme.com', 'admin'),
  (1, 'Bob', 'bob@acme.com', 'member'),
  (2, 'Carol', 'carol@globex.com', 'admin');

INSERT INTO posts (user_id, title, body, published) VALUES
  (1, 'Hello World', 'This is the first post.', true),
  (1, 'Second Post', 'Another post body.', true),
  (2, 'Draft', 'Not published yet.', false);

INSERT INTO comments (post_id, user_id, body) VALUES
  (1, 2, 'Great post!'),
  (1, 3, 'Thanks for sharing.');
