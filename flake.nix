{
  description = "DraughtsMind development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      devShells.${system}.default = pkgs.mkShell {
          buildInputs = with pkgs; [
          nodejs_22
          gnumake
          gcc
          python3
          pkg-config
          electron
          glib
          gtk3
          at-spi2-core
          nss
          nspr
          libdrm
          mesa
          libgbm
          libGL
          pango
          cairo
          alsa-lib
          cups
          libexif
          libnotify
          libx11
          libxcomposite
          libxdamage
          libxext
          libxfixes
          libxrandr
          libxcb
          libxtst
          libxkbcommon
          dbus
          udev
          expat
        ];

        shellHook = ''
          export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
            pkgs.glib
            pkgs.gtk3
            pkgs.at-spi2-core
            pkgs.nss
            pkgs.nspr
            pkgs.pango
            pkgs.cairo
            pkgs.alsa-lib
            pkgs.libdrm
            pkgs.mesa
            pkgs.libgbm
            pkgs.libGL
            pkgs.libx11
            pkgs.libxcomposite
            pkgs.libxdamage
            pkgs.libxext
            pkgs.libxfixes
            pkgs.libxrandr
            pkgs.libxcb
            pkgs.libxtst
            pkgs.libxkbcommon
            pkgs.cups
            pkgs.dbus
            pkgs.udev
            pkgs.expat
            pkgs.libnotify
            pkgs.libexif
          ]}:$LD_LIBRARY_PATH"
          echo "DraughtsMind dev shell ready"
          echo "  npm install        — install deps"
          echo "  npm start          — run Electron"
          echo "  npm test           — run tests"
          echo "  cd server && npm install && node index.js — run web server"
        '';
      };
    };
}
