CREATE TABLE organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  body TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL REFERENCES posts(id),
  user_id INT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- Vector search sample data: documents with JSON-array embeddings (4d)
CREATE TABLE documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  embedding JSON NOT NULL
);

INSERT INTO documents (title, category, embedding) VALUES
  ('Introduction to Databases', 'docs', '[0.12, 0.33, 0.18, 0.77]'),
  ('Advanced SQL Techniques', 'docs', '[0.11, 0.29, 0.22, 0.71]'),
  ('Database Normalization Guide', 'docs', '[0.41, 0.21, 0.53, 0.09]'),
  ('Indexing Strategies', 'docs', '[0.88, 0.15, 0.42, 0.30]'),
  ('Replication and Sharding', 'docs', '[0.55, 0.67, 0.12, 0.44]'),
  ('Query Optimization Tips', 'docs', '[0.14, 0.78, 0.31, 0.62]'),
  ('Transactions and Isolation', 'docs', '[0.33, 0.45, 0.66, 0.11]'),
  ('Stored Procedures Basics', 'tutorials', '[0.71, 0.22, 0.38, 0.55]'),
  ('Triggers and Events', 'tutorials', '[0.20, 0.59, 0.74, 0.16]'),
  ('Backup and Recovery', 'tutorials', '[0.63, 0.10, 0.85, 0.27]');
