{
  description = "Development environment for Storyteller";

  # Flake inputs
  inputs = {
    nixpkgs.url = "nixpkgs";
    devenv.url = "github:cachix/devenv";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  # Flake outputs
  outputs =
    {
      self,
      nixpkgs,
      devenv,
      ...
    }@inputs:
    let
      # Systems supported
      allSystems = [
        "x86_64-linux" # 64-bit Intel/AMD Linux
        "aarch64-linux" # 64-bit ARM Linux
        "x86_64-darwin" # 64-bit Intel macOS
        "aarch64-darwin" # 64-bit ARM macOS
      ];

      # Helper to provide system-specific attributes
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs allSystems (
          system:
          f {
            pkgs = import nixpkgs { inherit system; };
          }
        );
    in
    {
      packages = nixpkgs.lib.genAttrs allSystems (system: {
        devenv-up = self.devShells.${system}.default.config.procfileScript;
        devenv-test = self.devShells.${system}.default.config.test;
      });

      # Development environment output
      devShells = forAllSystems (
        { pkgs }:
        {
          default = devenv.lib.mkShell {
            inherit inputs pkgs;
            modules = [
              (
                { pkgs, ... }:
                {
                  # This is your devenv configuration
                  packages = [
                    pkgs.nodejs_22
                    (pkgs.corepack_22.override { nodejs = pkgs.nodejs_22; })
                  ];

                  tasks."repo:init" = {
                    description = "Do necessary work for setting up development";
                    exec = ''
                      yarn install
                      touch .devenv-initialized'';
                    status = "test -f .devenv-initialized";
                    before = [
                      "devenv:enterShell"
                      "devenv:enterTest"
                    ];
                  };

                  devcontainer.enable = true;
                  devcontainer.settings._COMMENT1 = "This file is auto-generated by flake.nix";
                  devcontainer.settings._COMMENT2 = "It gets overwritten by nix develop and the devcontainer.";
                  devcontainer.settings.customizations.vscode.extensions = [
                    # Default; needed to make devenv devcontainer work
                    "mkhl.direnv"
                    # Copied from .vscode/extensions.json
                    "dbaeumer.vscode-eslint"
                    "esbenp.prettier-vscode"
                    "bbenoist.nix"
                    "redhat.vscode-yaml"
                  ];
                  # Variant of default but works with flake devenv
                  devcontainer.settings.updateContentCommand = ''
                    mkdir -p ~/.local/share/nix/
                    echo -n '{"extra-substituters":{"https://devenv.cachix.org":true},"extra-trusted-public-keys":{"devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=":true}}' > ~/.local/share/nix/trusted-settings.json
                    DIRENV_WARN_TIMEOUT=0 direnv exec ''${containerWorkspaceFolder} devenv test'';

                  enterTest = "yarn check";
                }
              )
            ];
          };
        }
      );
    };
}
