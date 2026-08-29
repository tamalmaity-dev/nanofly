export type ServiceType = 'app' | 'database';
export type ServiceStatus = 'idle' | 'building' | 'deploying' | 'running' | 'stopped' | 'error' | 'creating';

export interface Service {
  id: string;
  project_id: string;
  name: string;
  type: ServiceType;
  status: ServiceStatus | string;
  port: number;
  image?: string;
  description?: string;
  git_repo_url?: string;
  git_branch?: string;
  builder?: string;
  git_token?: string;
  ssh_key?: string;
  github_app_id?: string | null;
  start_command?: string;
  install_command?: string;
  app_directory?: string;
  run_file?: string;
  requirements_file?: string;
  use_venv?: boolean;
  docker_args?: string;
  dockerfile_content?: string;
  docker_compose_content?: string;
  dockerfile_location?: string;
  build_stage_target?: string;
  build_custom_options?: string;
  base_directory?: string;
  docker_registry_image?: string;
  docker_registry_tag?: string;
  ports_exposes?: number;
  port_mappings?: string;
  network_aliases?: string;
  build_watch_paths?: string;
  build_use_server?: boolean;
  volumes?: string;
  resource_tier?: string;
  custom_memory?: number;
  custom_cpu?: number;
  db_user?: string;
  db_password?: string;
  db_name?: string;
  created_at?: string;
  updated_at?: string;
  // Enriched fields from stats
  cpu_percent?: number;
  memory_usage?: string;
}

export interface Domain {
  id: string;
  domain: string;
  service: string;
  project: string;
  project_id?: string;
  type?: string;
  target_port?: number;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface Deployment {
  id: string;
  service_id: string;
  status: string;
  log?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
}

export interface GithubApp {
  id: string | number;
  name: string;
  installation_id?: number;
  html_url?: string;
}

export interface Repo {
  clone_url: string;
  full_name: string;
  html_url?: string;
  private?: boolean;
  default_branch?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
}
